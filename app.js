require('dotenv').config();
var express = require('express');
var cors = require('cors');
var app = express();
var bodyParser = require('body-parser');
var jsonParser = bodyParser.json();
var jwt = require('jsonwebtoken');
var path = require('path');
var { readdirSync } = require('fs');
var morgan = require('morgan');
const secret = 'fullstack-login-lanchan';

const corsOptions = {
  origin: '*', 
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type'],
  credentials: true
};

app.use(express.static('public'));
app.use(cors(corsOptions));
app.use(express.json());

const mysql = require('mysql2');

const urlDB = `mysql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;

// สร้างการเชื่อมต่อฐานข้อมูล (แนะนำให้แยกไฟล์ config สำหรับข้อมูลฐานข้อมูล)
const connection = mysql.createConnection(urlDB);

readdirSync('./Routes').map((file) => {
  const routePath = path.join(__dirname, 'Routes', file);
  app.use('/', require(routePath));
});

const multer = require('multer');
const { resolve4 } = require('dns/promises');
const storage = multer.memoryStorage(); // เก็บไฟล์ในหน่วยความจำชั่วคราว
const upload = multer({ storage: storage });

// Add this to your app.js startup
const { exec } = require('child_process');

console.log('=== CONTAINER DEBUG ===');
exec('python3 --version', (err, stdout) => {
  console.log('Python version:', stdout || 'Not found');
});

exec('pip3 list', (err, stdout) => {
  console.log('Installed packages:', stdout || 'pip3 not found');
});

exec('find /usr -name "*pandas*" 2>/dev/null', (err, stdout) => {
  console.log('Pandas locations:', stdout || 'Not found');
});


app.post('/register', jsonParser, (req, res) => {
  const { R_username, email, Password, R_Tel, R_Name } = req.body;

  // ตรวจสอบค่าว่าง
  if (!R_username || !email || !Password || !R_Tel || !R_Name) {
    return res.status(400).json({ status: 'error', message: 'All fields are required' });
  }

  connection.execute(
    'INSERT INTO role (R_username, email, Password, R_Tel, R_Name) VALUES (?, ?, ?, ?, ?)',
    [R_username, email, Password, R_Tel, R_Name],
    (err, results) => {
      if (err) {
        console.error('Database error:', err);
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({ status: 'error', message: 'Username or email already exists' });
        } else {
          return res.status(500).json({ status: 'error', message: 'Internal server error' });
        }
      }
      res.json({ status: 'ok', message: 'Registration successful' });
    }
  );
});

app.post('/login', jsonParser, (req, res) => {
  const { email, Password } = req.body;

  if (!email || !Password) {
    return res.status(400).json({ status: 'error', message: 'Email and password are required' });
  }

  connection.execute(
    'SELECT * FROM role WHERE email = ?',
    [email],
    (err, users) => {
      if (err) {
        return res.status(500).json({ status: 'error', message: 'Database error', detail: err });
      }
      if (users.length === 0) {
        return res.status(401).json({ status: 'error', message: 'User not found' });
      }
      const user = users[0];

      // ในระบบจริงควรใช้ bcrypt ในการเปรียบเทียบรหัสผ่าน
      if (user.Password === Password) {
        // สร้าง token กำหนดค่าอายุ 1 ชั่วโมง
        const token = jwt.sign(
          { userId: user.id, email: user.email, role: user.R_Name },
          secret,
          { expiresIn: '1h' }
        );

        return res.json({
          status: 'ok',
          message: 'Login success',
          token,
          role: user.R_Name,
          // ไม่ส่งข้อมูลที่ละเอียดอ่อน
          user: {
            email: user.email,
            role: user.R_Name
          }
        });
      } else {
        return res.status(401).json({ status: 'error', message: 'Incorrect password' });
      }
    }
  );
});

app.post('/authen', jsonParser, (req, res) => {
  try {
    // ตรวจสอบว่ามี Authorization header หรือไม่
    if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
      return res.status(401).json({ status: 'error', message: 'No token provided' });
    }

    const token = req.headers.authorization.split(' ')[1];

    // ตรวจสอบ token ด้วย jwt
    const decoded = jwt.verify(token, secret);

    // ตรวจสอบข้อมูลผู้ใช้ในฐานข้อมูลเพื่อความแน่ใจ
    connection.execute(
      'SELECT * FROM role WHERE email = ?',
      [decoded.email],
      (err, users) => {
        if (err) {
          return res.status(500).json({ status: 'error', message: 'Database error' });
        }
        if (users.length === 0) {
          return res.status(401).json({ status: 'error', message: 'User not found' });
        }

        // ส่งข้อมูลผู้ใช้กลับไป (ไม่รวมข้อมูลที่ละเอียดอ่อน)
        res.json({
          status: 'ok',
          decoded: {
            email: decoded.email,
            role: decoded.role,
            exp: decoded.exp
          }
        });
      }
    );
  } catch (err) {
    // ใช้ status code 401 สำหรับ Unauthorized
    res.status(401).json({ status: 'error', message: err.message });
  }
});


const authenticateToken = (req, res, next) => {
  try {
    if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
      return res.status(401).json({ status: 'error', message: 'No token provided' });
    }

    const token = req.headers.authorization.split(' ')[1];
    const decoded = jwt.verify(token, secret);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ status: 'error', message: 'Invalid or expired token' });
  }
};

const authorizeRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ status: 'error', message: 'Not authenticated' });
    }

    if (allowedRoles.includes(req.user.role)) {
      next();
    } else {
      return res.status(403).json({ status: 'error', message: 'Access denied' });
    }
  };
};

app.get('/protected-route', authenticateToken, authorizeRole(['owner', 'manager']), (req, res) => {
  res.json({ status: 'ok', message: 'Access granted', data: 'This is protected data' });
});

app.post('/addmenu', upload.single('Menu_picture'), (req, res) => {
  const { Menu_name, Menu_price, Menu_category } = req.body;
  const Menu_picture = req.file.buffer; // รับข้อมูลรูปภาพจาก request

  connection.execute(
    'INSERT INTO menu (Menu_name, Menu_price, Menu_category, Menu_picture) VALUES (?, ?, ?, ?)',
    [Menu_name, Menu_price, Menu_category, Menu_picture],
    (err, results) => {
      if (err) {
        console.error('Error adding menu:', err);
        res.json({ status: 'error', message: err.message });
        return;
      }
      res.json({ status: 'ok' });
    }
  );
});

app.get('/getmenu', (req, res) => {
  connection.query('SELECT * FROM menu', (err, results) => {
    if (err) {
      console.error('Error fetching menu items:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
    const processedResults = results.map(item => ({
      ...item,
      Menu_picture: item.Menu_picture ? item.Menu_picture.toString('base64') : null
    }));
    res.json(processedResults);
  });
});


app.get('/getmenu/:id', (req, res) => {
  const menuId = req.params.id;
  connection.query('SELECT * FROM menu WHERE Menu_id = ?', [menuId], (err, results) => {
    if (err) {
      console.error('Error fetching menu item:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
    if (results.length === 0) {
      res.status(404).json({ error: 'Menu item not found' });
      return;
    }
    const processedResult = {
      ...results[0],
      Menu_picture: results[0].Menu_picture.toString('base64')
    };
    res.json(processedResult);
  });
});


app.put('/updatenoodlemenu/:id', jsonParser, (req, res) => {
  const menuId = req.params.id;
  const { Noodle_menu_price, Soup_id, Size_id, Meat_id, Noodle_type_id, Noodle_menu_picture } = req.body;

  let query = 'UPDATE noodle_menu SET  Noodle_menu_price = ?, Soup_id = ?, Size_id = ?, Meat_id = ?, Noodle_type_id = ?';
  let params = [Noodle_menu_price, Soup_id, Size_id, Meat_id, Noodle_type_id];

  if (Noodle_menu_picture) {
    query += ', Noodle_menu_picture = ?';
    params.push(Buffer.from(Noodle_menu_picture, 'base64'));
  }

  query += ' WHERE Noodle_menu_id = ?';
  params.push(menuId);

  connection.execute(query, params, (err, result) => {
    if (err) {
      console.error('Error updating menu:', err);
      res.status(500).json({ status: 'error', message: err.message });
      return;
    }
    res.json({ status: 'ok', message: 'Menu updated successfully' });
  });
});

app.put('/updatemenu/:id', jsonParser, (req, res) => {
  const menuId = req.params.id;
  const { Menu_name, Menu_price, Menu_category, Menu_picture } = req.body;

  let query = 'UPDATE menu SET Menu_name = ?, Menu_price = ?, Menu_category = ?';
  let params = [Menu_name, Menu_price, Menu_category];

  if (Menu_picture) {
    query += ', Menu_picture = ?';
    params.push(Buffer.from(Menu_picture, 'base64'));
  }

  query += ' WHERE Menu_id = ?';
  params.push(menuId);

  connection.execute(query, params, (err, result) => {
    if (err) {
      console.error('Error updating menu:', err);
      res.status(500).json({ status: 'error', message: err.message });
      return;
    }
    res.json({ status: 'ok', message: 'Menu updated successfully' });
  });
});

// app.get('/getnoodlemenu', (req, res) => {
//   connection.query('SELECT * FROM noodle_menu', (err, results) => {
//     if (err) {
//       console.error('Error fetching noodle menu items:', err);
//       res.status(500).json({ error: 'Internal server error' });
//       return;
//     }
//     const processedResults = results.map(item => {
//       // ตรวจสอบว่า Noodle_menu_picture มีค่าและเป็น Buffer หรือไม่
//       const pictureBase64 = item.Noodle_menu_picture && Buffer.isBuffer(item.Noodle_menu_picture)
//         ? item.Noodle_menu_picture.toString('base64')
//         : null;

//       return {
//         ...item,
//         Noodle_menu_picture: pictureBase64
//       };
//     });
//     // Log ผลลัพธ์ที่ประมวลผลแล้ว
//     res.json(processedResults);
//   });
// });


// app.get('/getnoodlemenu/:id', (req, res) => {
//   const menuId = req.params.id;
//   connection.query('SELECT * FROM noodle_menu WHERE Noodle_menu_id = ?', [menuId], (err, results) => {
//     if (err) {
//       console.error('Error fetching menu item:', err);
//       res.status(500).json({ error: 'Internal server error' });
//       return;
//     }
//     if (results.length === 0) {
//       res.status(404).json({ error: 'Menu item not found' });
//       return;
//     }
//     const result = results[0];
//     const processedResult = {
//       ...result,
//       Noodle_menu_picture: result.Noodle_menu_picture ? result.Noodle_menu_picture.toString('base64') : null
//     };
//     res.json(processedResult);
//   });
// });




app.get('/getem', (req, res) => {
  connection.query("SELECT * FROM role", (err, results) => {
    if (err) {
      console.error('Error fetching employees', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
    res.json(results);
  });
});


app.get('/getem/:id', (req, res) => {
  const employeeId = req.params.id;
  connection.query("SELECT * FROM role WHERE R_id = ?", [employeeId], (err, results) => {
    if (err) {
      console.error('Error fetching employee details', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
    if (results.length === 0) {
      res.status(404).json({ error: 'Employee not found' });
      return;
    }
    res.json(results[0]);
  });
});

app.post('/addem', upload.none(), (req, res) => {
  const { R_username, email, Password, R_Tel, R_Name } = req.body;

  // ตรวจสอบว่ามีข้อมูลครบถ้วนหรือไม่
  if (!R_username || !email || !Password || !R_Tel || !R_Name) {
    return res.status(400).json({ status: 'error', message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }

  const query = 'INSERT INTO role (R_username, email, Password, R_Tel, R_Name) VALUES (?, ?, ?, ?, ?)';

  connection.execute(query, [R_username, email, Password, R_Tel, R_Name], (err, results) => {
    if (err) {
      console.error('เกิดข้อผิดพลาดในการเพิ่มพนักงาน:', err);
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ status: 'error', message: 'อีเมลนี้มีอยู่ในระบบแล้ว' });
      }
      return res.status(500).json({ status: 'error', message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
    }

    res.json({ status: 'ok', message: 'เพิ่มพนักงานสำเร็จ', id: results.insertId });
  });
});


app.put('/updateem/:id', (req, res) => {
  const employeeId = req.params.id;
  const { R_username, email, password, R_Tel, R_Name } = req.body;

  console.log('Received data:', req.body);  // เพิ่ม logging

  // ตรวจสอบว่า R_Tel ไม่เป็น undefined หรือ null
  if (R_Tel === undefined || R_Tel === null) {
    return res.status(400).json({ status: 'error', message: 'R_Tel is required' });
  }

  const query = "UPDATE role SET R_username = ?, email = ?, password = ?, R_Tel = ?, R_Name = ? WHERE R_id = ?";
  connection.query(query, [R_username, email, password, R_Tel, R_Name, employeeId], (err, results) => {
    if (err) {
      console.error('Error updating employee', err);
      res.status(500).json({ status: 'error', message: 'Internal server error' });
      return;
    }
    res.json({ status: 'ok', message: 'Employee updated successfully' });
  });
});


app.delete('/deleteemployee/:id', (req, res) => {
  const employeeId = req.params.id;

  const query = "DELETE FROM role WHERE R_id = ?";
  connection.query(query, [employeeId], (err, results) => {
    if (err) {
      console.error('Error deleting employee', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
    res.json({ message: 'Employee deleted successfully' });
  });
});





app.delete('/deletemenu/:id', (req, res) => {
  const menuId = req.params.id;
  const query = 'DELETE FROM menu WHERE Menu_id = ?';

  connection.execute(query, [menuId], (error, results) => {
    if (error) {
      console.error('Error deleting menu:', error);
      res.status(500).json({ status: 'error', message: 'An error occurred while deleting the menu' });
      return;
    }

    if (results.affectedRows === 0) {
      res.status(404).json({ status: 'error', message: 'Menu not found' });
      return;
    }

    res.json({ status: 'ok', message: 'Menu deleted successfully' });
  });
});


app.delete('/deletenoodlemenu/:id', (req, res) => {
  const menuId = req.params.id;

  // ตรวจสอบว่ามีการใช้เมนูนี้ใน order_detail หรือไม่
  const checkOrderQuery = 'SELECT * FROM order_detail WHERE Noodle_menu_id = ?';
  connection.query(checkOrderQuery, [menuId], (checkErr, checkResults) => {
    if (checkErr) {
      console.error('Error checking order details:', checkErr);
      return res.status(500).json({ status: 'error', message: 'An error occurred while checking order details' });
    }

    if (checkResults.length > 0) {
      return res.status(400).json({ status: 'error', message: 'Cannot delete this menu as it is used in orders' });
    }

    // ถ้าไม่มีการใช้ในออเดอร์ ทำการลบ
    const deleteQuery = 'DELETE FROM noodle_menu WHERE Noodle_menu_id = ?';
    connection.query(deleteQuery, [menuId], (deleteErr, deleteResults) => {
      if (deleteErr) {
        console.error('Error deleting noodle menu:', deleteErr);
        return res.status(500).json({ status: 'error', message: 'An error occurred while deleting the noodle menu' });
      }

      if (deleteResults.affectedRows === 0) {
        return res.status(404).json({ status: 'error', message: 'Noodle menu not found' });
      }

      res.json({ status: 'ok', message: 'Noodle menu deleted successfully' });
    });
  });
});


// app.post('/addnoodlemenu', upload.single('Noodle_menu_picture'), (req, res) => {
//   const { Noodle_menu_price, Soup_id, Size_id, Meat_id, Noodle_type_id } = req.body;
//   const Noodle_menu_picture = req.file ? req.file.buffer : null;

//   // ตรวจสอบข้อมูลที่จำเป็น
//   if (!Noodle_menu_price || !Soup_id || !Size_id || !Meat_id || !Noodle_type_id) {
//     return res.status(400).json({
//       status: 'error',
//       message: 'Missing required fields'
//     });
//   }

//   // สร้าง query เพื่อตรวจสอบเมนูซ้ำ
//   const checkDuplicateQuery = `
//     SELECT * FROM noodle_menu 
//     WHERE Soup_id = ? 
//     AND Size_id = ? 
//     AND Meat_id = ? 
//     AND Noodle_type_id = ?
//   `;

//   // ตรวจสอบเมนูซ้ำ
//   connection.query(
//     checkDuplicateQuery,
//     [Soup_id, Size_id, Meat_id, Noodle_type_id],
//     (checkErr, checkResults) => {
//       if (checkErr) {
//         console.error('Error checking for duplicate noodle menu:', checkErr);
//         return res.status(500).json({
//           status: 'error',
//           message: 'An error occurred while checking for duplicate noodle menu'
//         });
//       }

//       if (checkResults.length > 0) {
//         return res.status(409).json({
//           status: 'duplicate',
//           message: 'This noodle menu already exists'
//         });
//       }

//       // สร้าง query สำหรับเพิ่มเมนูใหม่
//       const insertQuery = `
//         INSERT INTO noodle_menu (
//           Noodle_menu_price, 
//           Noodle_menu_picture, 
//           Soup_id, 
//           Size_id, 
//           Meat_id, 
//           Noodle_type_id
//         )
//         VALUES (?, ?, ?, ?, ?, ?)
//       `;

//       // เพิ่มเมนูใหม่
//       connection.query(
//         insertQuery,
//         [
//           Noodle_menu_price,
//           Noodle_menu_picture,
//           Soup_id,
//           Size_id,
//           Meat_id,
//           Noodle_type_id
//         ],
//         (insertErr, insertResults) => {
//           if (insertErr) {
//             console.error('Error adding noodle menu:', insertErr);
//             return res.status(500).json({
//               status: 'error',
//               message: 'An error occurred while adding the noodle menu'
//             });
//           }

//           res.status(201).json({
//             status: 'ok',
//             message: 'Noodle menu added successfully',
//             id: insertResults.insertId
//           });
//         }
//       );
//     }
//   );
// });


app.post('/addnoodletype', jsonParser, (req, res) => {
  const { noodletypename, noodletypeprice } = req.body;

  if (!noodletypename) {
    return res.status(400).json({ status: 'error', message: 'noodle name is required' });
  }

  const checkDuplicateQuery = 'SELECT * FROM noodle_type WHERE Noodle_type_name = ?';

  connection.query(checkDuplicateQuery, [noodletypename], (checkErr, checkResults) => {
    if (checkErr) {
      console.error('Error checking for duplicate noodle:', checkErr);
      return res.status(500).json({ status: 'error', message: 'An error occurred while checking for duplicate noodle' });
    }

    if (checkResults.length > 0) {
      return res.status(409).json({ status: 'duplicate', message: 'This noodle type already exists' });
    }

    const insertQuery = 'INSERT INTO noodle_type (Noodle_type_name, Noodle_type_price) VALUES (?, ?)';

    connection.query(insertQuery, [noodletypename, noodletypeprice], (insertErr, insertResults) => {
      if (insertErr) {
        console.error('Error adding noodle:', insertErr);
        return res.status(500).json({ status: 'error', message: 'An error occurred while adding the noodle' });
      }

      res.status(201).json({ status: 'ok', message: 'noodle added successfully', id: insertResults.insertId });
    });
  });
});

app.post('/addmeat', jsonParser, (req, res) => {
  const { meat, meatprice } = req.body;

  if (!meat) {
    return res.status(400).json({ status: 'error', message: 'Meat name is required' });
  }

  const checkDuplicateQuery = 'SELECT * FROM meat WHERE Meat_name = ?';

  connection.query(checkDuplicateQuery, [meat], (checkErr, checkResults) => {
    if (checkErr) {
      console.error('Error checking for duplicate meat:', checkErr);
      return res.status(500).json({ status: 'error', message: 'An error occurred while checking for duplicate meat' });
    }

    if (checkResults.length > 0) {
      return res.status(409).json({ status: 'duplicate', message: 'This meat type already exists' });
    }

    const insertQuery = 'INSERT INTO meat (Meat_name, Meat_price) VALUES (?,?)';

    connection.query(insertQuery, [meat, meatprice], (insertErr, insertResults) => {
      if (insertErr) {
        console.error('Error adding meat:', insertErr);
        return res.status(500).json({ status: 'error', message: 'An error occurred while adding the meat' });
      }

      res.status(201).json({ status: 'ok', message: 'Meat added successfully', id: insertResults.insertId });
    });
  });
});

app.post('/addsize', (req, res) => {
  const { size, sizeprice } = req.body;

  if (!size) {
    return res.status(400).json({ status: 'error', message: 'Size is required' });
  }

  const checkDuplicateQuery = 'SELECT * FROM size WHERE Size_name = ?';

  connection.query(checkDuplicateQuery, [size], (checkErr, checkResults) => {
    if (checkErr) {
      console.error('Error checking for duplicate size:', checkErr);
      return res.status(500).json({ status: 'error', message: 'An error occurred while checking for duplicate size' });
    }

    if (checkResults.length > 0) {
      return res.status(409).json({ status: 'duplicate', message: 'This size already exists' });
    }

    const insertQuery = 'INSERT INTO size (Size_name, Size_price) VALUES (?,?)';

    connection.query(insertQuery, [size, sizeprice], (insertErr, insertResults) => {
      if (insertErr) {
        console.error('Error adding size:', insertErr);
        return res.status(500).json({ status: 'error', message: 'An error occurred while adding the size' });
      }

      res.status(201).json({ status: 'ok', message: 'Size added successfully', id: insertResults.insertId });
    });
  });
});

app.post('/addsoup', jsonParser, (req, res) => {
  const { soup, soupprice } = req.body;

  if (!soup) {
    return res.status(400).json({ status: 'error', message: 'Soup is required' });
  }

  const checkDuplicateQuery = 'SELECT * FROM soup WHERE Soup_name = ?';

  connection.query(checkDuplicateQuery, [soup], (checkErr, checkResults) => {
    if (checkErr) {
      console.error('Error checking for duplicate meat:', checkErr);
      return res.status(500).json({ status: 'error', message: 'An error occurred while checking for duplicate meat' });
    }

    if (checkResults.length > 0) {
      return res.status(409).json({ status: 'duplicate', message: 'This meat type already exists' });
    }

    const insertQuery = 'INSERT INTO soup (Soup_name, Soup_price) VALUES (?,?)';

    connection.query(insertQuery, [soup, soupprice], (insertErr, insertResults) => {
      if (insertErr) {
        console.error('Error adding soup:', insertErr);
        return res.status(500).json({ status: 'error', message: 'An error occurred while adding the soup' });
      }

      res.status(201).json({ status: 'ok', message: 'Soup added successfully', id: insertResults.insertId });
    });
  })
});

app.get('/soups', (req, res) => {
  connection.query('SELECT * FROM soup', (err, results) => {
    if (err) {
      console.error('Error fetching soups:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
    res.json(results);
  });
});

// GET all sizes
app.get('/sizes', (req, res) => {
  connection.query('SELECT * FROM size', (err, results) => {
    if (err) {
      console.error('Error fetching sizes:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
    res.json(results);
  });
});

// GET all meats
app.get('/meats', (req, res) => {
  connection.query('SELECT * FROM meat', (err, results) => {
    if (err) {
      console.error('Error fetching meats:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
    res.json(results);
  });
});

// GET all noodle types
app.get('/noodletypes', (req, res) => {
  connection.query('SELECT * FROM noodle_type', (err, results) => {
    if (err) {
      console.error('Error fetching noodle types:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
    res.json(results);
  });
});



app.post('/addnoodlemenu', upload.single('Noodle_menu_picture'), (req, res) => {
  console.log('Received data:', req.body);
  console.log('Received file:', req.file);
  const { Noodle_menu_name, Noodle_menu_price, Soup_id, Size_id, Meat_id, Noodle_type_id } = req.body;
  const Noodle_menu_picture = req.file ? req.file.buffer : null;

  // ตรวจสอบข้อมูลที่จำเป็น
  if (!Noodle_menu_name || !Noodle_menu_price || !Soup_id || !Size_id || !Meat_id || !Noodle_type_id) {
    return res.status(400).json({ status: 'error', message: 'Missing required fields' });
  }

  const query = `
    INSERT INTO noodle_menu 
    (Noodle_menu_name, Noodle_menu_price, Noodle_menu_picture, Soup_id, Size_id, Meat_id, Noodle_type_id) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  connection.execute(
    query,
    [Noodle_menu_name, Noodle_menu_price, Noodle_menu_picture, Soup_id, Size_id, Meat_id, Noodle_type_id],
    (err, results) => {
      if (err) {
        console.error('Error adding noodle menu:', err);
        res.status(500).json({ status: 'error', message: 'An error occurred while adding the noodle menu', error: err.message });
        return;
      }
      res.json({ status: 'ok', message: 'Noodle menu added successfully', id: results.insertId });
    }
  );
});

app.delete('/deletenoodletype/:id', (req, res) => {
  const noodleTypeId = req.params.id;

  const query = 'DELETE FROM noodle_type WHERE Noodle_type_id = ?';

  connection.execute(query, [noodleTypeId], (error, results) => {
    if (error) {
      console.error('Error deleting noodle type:', error);
      res.status(500).json({ status: 'error', message: 'An error occurred while deleting the noodle type' });
      return;
    }

    if (results.affectedRows === 0) {
      res.status(404).json({ status: 'error', message: 'Noodle type not found' });
      return;
    }

    res.json({ status: 'ok', message: 'Noodle type deleted successfully' });
  });
});
app.delete('/deleteMeat/:id', (req, res) => {
  const meatId = req.params.id;

  const query = 'DELETE FROM meat WHERE Meat_id = ?';

  connection.execute(query, [meatId], (error, results) => {
    if (error) {
      console.error('Error deleting noodle type:', error);
      res.status(500).json({ status: 'error', message: 'An error occurred while deleting the noodle type' });
      return;
    }

    if (results.affectedRows === 0) {
      res.status(404).json({ status: 'error', message: 'Noodle type not found' });
      return;
    }

    res.json({ status: 'ok', message: 'Noodle type deleted successfully' });
  });
});
app.delete('/deletesize/:id', (req, res) => {
  const sizeId = req.params.id;

  const query = 'DELETE FROM size WHERE Size_id = ?';

  connection.execute(query, [sizeId], (error, results) => {
    if (error) {
      console.error('Error deleting noodle type:', error);
      res.status(500).json({ status: 'error', message: 'An error occurred while deleting the noodle type' });
      return;
    }

    if (results.affectedRows === 0) {
      res.status(404).json({ status: 'error', message: 'Noodle type not found' });
      return;
    }

    res.json({ status: 'ok', message: 'Noodle type deleted successfully' });
  });
});
app.delete('/deletesoup/:id', (req, res) => {
  const soupId = req.params.id;

  const query = 'DELETE FROM soup WHERE Soup_id = ?';

  connection.execute(query, [soupId], (error, results) => {
    if (error) {
      console.error('Error deleting noodle type:', error);
      res.status(500).json({ status: 'error', message: 'An error occurred while deleting the noodle type' });
      return;
    }

    if (results.affectedRows === 0) {
      res.status(404).json({ status: 'error', message: 'Noodle type not found' });
      return;
    }

    res.json({ status: 'ok', message: 'Noodle type deleted successfully' });
  });
});

app.get('/getorders', (req, res) => {
  connection.query('SELECT * FROM `order`', (err, results) => {
    if (err) {
      console.error('Error fetching orders:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
    res.json(results);
  });
});

app.get('/gettotalcountorderdetail/:id', (req, res) => {
  const orderId = req.params.id;
  connection.query(
    'SELECT SUM(order_detail_quantity) AS Total_items FROM order_detail WHERE Order_id = ?', [orderId], (err, results) => {
      if (err) {
        console.error('Error fetching order:', err);
        res.status(500).json({ error: 'Internal server error' });
        return;
      }
      if (results.length === 0) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }
      res.json(results[0]);
    }
  );
});

app.post('/apriori', async (req, res) => {
  try {
    // Get parameters from request body or use defaults
    const params = {
      db_config: {
        host: process.env.DB_HOST || req.body.host || 'localhost',
        user: process.env.DB_USER || req.body.user || 'root',
        password: process.env.DB_PASSWORD || req.body.password || '',
        database: process.env.DB_NAME || req.body.database || 'project',
        query: req.body.query || 'SELECT transaction_id, item_id FROM transactions'
      },
      min_support: req.body.min_support || 0.1,
      min_confidence: req.body.min_confidence || 0.5,
      min_lift: req.body.min_lift || 1.0
    };

    // Run Apriori analysis
    const results = await runApriori(params);

    // Send results to client
    res.json(results);
  } catch (error) {
    console.error('Error in Apriori analysis:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/getorderdetail/:id', (req, res) => {
  const orderId = req.params.id;
  const query = `
    SELECT od.*, 
          od.Order_detail_created_at AS timestamp,
           CASE 
          WHEN m.Menu_id IS NOT NULL THEN m.Menu_name
          ELSE CONCAT(
            nt.noodle_type_name, ' ',
            s.soup_name, ' ',
            mt.meat_name,' ',       
            sz.size_name      
          )
        END AS name,
        COALESCE(m.Menu_price, od.Order_detail_price) AS price
       FROM order_detail od
       LEFT JOIN menu m ON od.Menu_id = m.Menu_id
       LEFT JOIN noodle_type nt ON od.Noodle_type_id = nt.noodle_type_id
       LEFT JOIN soup s ON od.Soup_id = s.soup_id
       LEFT JOIN size sz ON od.Size_id = sz.size_id
       LEFT JOIN meat mt ON od.Meat_id = mt.meat_id
    WHERE od.Order_id = ?
  `;

  connection.query(query, [orderId], (err, results) => {
    if (err) {
      console.error('Error fetching order details:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
    if (results.length === 0) {
      res.status(404).json({ error: 'Order details not found' });
      return;
    }
    res.json(results);
  });
});

app.get('/getserveoder', (req, res) => {
  const query = `
    SELECT o.*, 
           COUNT(od.Order_detail_id) AS total_items,
           SUM(CASE WHEN od.status_id = '5' THEN 1 ELSE 0 END) AS preparing_items
    FROM \`order\` o
    JOIN order_detail od ON o.Order_id = od.Order_id
    GROUP BY o.Order_id
    HAVING preparing_items > 0
    ORDER BY o.Order_datetime DESC
  `;

  connection.query(query, (error, results) => {
    if (error) {
      console.error('Error fetching preparing orders:', error);
      res.status(500).json({ error: 'An error occurred while fetching preparing orders' });
      return;
    }

    res.json(results);
  });
});

app.get('/getactiveorders', (req, res) => {
  const query = `
    SELECT o.*,
           COUNT(od.Order_detail_id) AS total_items,
           SUM(CASE WHEN od.status_id != '4' THEN 1 ELSE 0 END) AS pending_items
    FROM \`order\` o
    JOIN order_detail od ON o.Order_id = od.Order_id
    GROUP BY o.Order_id
    HAVING pending_items > 0
    ORDER BY o.Order_datetime DESC
  `;

  connection.query(query, (error, results) => {
    if (error) {
      console.error('Error fetching active orders:', error);
      res.status(500).json({ error: 'An error occurred while fetching orders' });
      return;
    }

    res.json(results);
  });
});


app.get('/getpartiallyservedorders', (req, res) => {
  const query = `
    SELECT o.*, 
           COUNT(od.Order_detail_id) AS total_items,
           SUM(CASE WHEN od.status_id = '4' THEN 1 ELSE 0 END) AS served_items
    FROM \`order\` o
    JOIN order_detail od ON o.Order_id = od.Order_id
    GROUP BY o.Order_id
    HAVING served_items > 0
    ORDER BY o.Order_datetime DESC
  `;

  connection.query(query, (error, results) => {
    if (error) {
      console.error('Error fetching partially served orders:', error);
      res.status(500).json({ error: 'An error occurred while fetching partially served orders' });
      return;
    }

    res.json(results);
  });
});

// app.put('/updateorderstatustoserved/:id', (req, res) => {
//   const { id } = req.params;
//   const { status } = req.body;

//   const query = 'UPDATE order_detail SET status_id = ? WHERE Order_detail_id = ?';

//   connection.query(query, [status, id], (error, results) => {
//     if (error) {
//       console.error('Error updating order status to served:', error);
//       res.status(500).json({ error: 'An error occurred while updating the order status' });
//       return;
//     }
//     res.json({ message: 'Order status updated to served successfully' });
//   });
// });


app.get('/getpreparingorders', (req, res) => {
  const query = `
    SELECT o.*, 
           COUNT(od.Order_detail_id) AS total_items,
           SUM(CASE WHEN od.status_id = '3' THEN 1 ELSE 0 END) AS preparing_items
    FROM \`order\` o
    JOIN order_detail od ON o.Order_id = od.Order_id
    GROUP BY o.Order_id
    HAVING preparing_items > 0
    ORDER BY o.Order_datetime DESC
  `;
  connection.query(query, (error, results) => {
    if (error) {
      console.error('Error fetching preparing orders:', error);
      res.status(500).json({ error: 'An error occurred while fetching preparing orders' });
      return;
    }

    res.json(results);
  });
});

app.get('/getServedOrders', (req, res) => {
  const query = `
    SELECT o.*, 
           COUNT(od.Order_detail_id) AS total_items,
           SUM(CASE WHEN od.status_id = '4' THEN 1 ELSE 0 END) AS preparing_items
    FROM \`order\` o
    JOIN order_detail od ON o.Order_id = od.Order_id
    GROUP BY o.Order_id
    HAVING preparing_items > 0
    ORDER BY o.Order_datetime DESC
  `;
  connection.query(query, (error, results) => {
    if (error) {
      console.error('Error fetching preparing orders:', error);
      res.status(500).json({ error: 'An error occurred while fetching preparing orders' });
      return;
    }

    res.json(results);
  });
});


app.put('/updateorderpayment/:orderId', async (req, res) => {
  const { orderId } = req.params;
  const { paymentMethod } = req.body;

  try {
    // Update the order status to "ชำระเงินเรียบร้อย"
    const updateQuery = `
      UPDATE \`order\`
      SET  status_id = ?
      WHERE Order_id = ?
    `;

    const [result] = await connection.promise().query(updateQuery, [6, orderId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.status(200).json({ message: 'Order payment status updated successfully' });
  } catch (error) {
    console.error('Error updating order payment status:', error);
    res.status(500).json({ error: 'An error occurred while updating the order payment status' });
  }
});


app.put('/updateorderstatus/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const query = 'UPDATE order_detail SET status_id = ? WHERE Order_detail_id = ?';

  connection.query(query, [status, id], (error, results) => {
    if (error) {
      console.error('Error updating order status:', error);
      res.status(500).json({ error: 'An error occurred while updating the order status' });
      return;
    }
    res.json({ message: 'Order status updated successfully' });
  });
});


app.get('/table', (req, res) => {
  connection.query('SELECT * FROM tables', (err, results) => {
    if (err) {
      console.error('Error fetching tables:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
    res.json(results);
  });
});

app.post('/table', (req, res) => {
  const { tables_number, status_id } = req.body;
  const query = 'INSERT INTO tables (tables_id, tables_number, status_id) VALUES (?, ?, ?)';

  connection.execute(query, [tables_number, tables_number, status_id], (err, results) => {
    if (err) {
      console.error('Error inserting table:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
    res.status(201).json({ message: 'Table added successfully', id: tables_number });
  });
});


app.put('/table/:id', (req, res) => {
  const { id } = req.params;
  const { tables_number, status_id } = req.body;
  const query = 'UPDATE tables SET tables_number = ?, status_id = ? WHERE tables_id = ?';
  connection.execute(query, [tables_number, status_id, id], (err, results) => {
    if (err) {
      console.error('Error updating table:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
    if (results.affectedRows === 0) {
      return res.status(404).json({ message: 'Table not found' });
    }
    res.json({ message: 'Table updated successfully' });
  });
});

app.delete('/table/:id', (req, res) => {
  const { id } = req.params;
  const query = 'DELETE FROM tables WHERE tables_id = ?';
  connection.execute(query, [id], (err, results) => {
    if (err) {
      console.error('Error deleting table:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
    if (results.affectedRows === 0) {
      return res.status(404).json({ message: 'Table not found' });
    }
    res.json({ message: 'Table deleted successfully' });
  });
});

app.put('/updatetablestatus/:tableId', async (req, res) => {

  const { tableId } = req.params;
  const { status } = req.body;

  const query = 'UPDATE tables SET status_id = ? WHERE tables_id = ?';
  connection.query(query, [status, tableId], (error) => {
    if (error) {
      console.error('Error update table', error);
      res.status(500).json({ error: 'An error occurred while updating table status' });
      return;
    }
    res.json({ message: 'table status updated successfully' });
  });


});

app.get('/getstatus', (req, res) => {
  connection.query('SELECT * FROM status', (err, results) => {
    if (err) {
      console.error('Error fetching status:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
    res.json(results);
  });
});


// ดึงจำนวนออร์เดอร์ทั้งหมด
app.get('/getordertotal', (req, res) => {
  const { startDate, endDate } = req.query;
  let query = 'SELECT COUNT(*) AS total FROM `order`';
  const params = [];

  if (startDate && endDate) {
    query += ' WHERE order_datetime BETWEEN ? AND ?';
    params.push(startDate, endDate);
  }

  connection.query(query, params, (err, results) => {
    if (err) {
      console.error('Error fetching total orders:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
    res.json({ total: results[0].total });
  });
});

// ดึงเมนูที่ถูกสั่งมากที่สุด
app.get('/getTopOrderedMenus', (req, res) => {
  const { startDate, endDate } = req.query;
  let query = `
    SELECT 
      m.Menu_name AS name,
      SUM(od.Order_detail_quantity) AS total_quantity
    FROM order_detail od
    JOIN menu m ON od.Menu_id = m.Menu_id
    JOIN \`order\` o ON od.Order_id = o.Order_id
  `;
  const params = [];

  if (startDate && endDate) {
    query += ' WHERE o.order_datetime BETWEEN ? AND ?';
    params.push(startDate, endDate);
  }

  query += `
    GROUP BY m.Menu_id
    ORDER BY total_quantity DESC
    LIMIT 5
  `;

  connection.query(query, params, (err, results) => {
    if (err) {
      console.error('Error fetching top ordered menus:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
    res.json(results);
  });
});

// ดึงรายได้รวม
app.get('/getTotalRevenue', (req, res) => {
  const { startDate, endDate } = req.query;
  let query = `
    SELECT SUM(od.Order_detail_price * od.Order_detail_quantity) AS total_revenue
    FROM order_detail od
    INNER JOIN \`order\` o ON od.Order_id = o.Order_id
  `;
  const params = [];

  if (startDate && endDate) {
    query += ' WHERE o.order_datetime BETWEEN ? AND ?';
    params.push(startDate, endDate);
  }

  connection.query(query, params, (err, results) => {
    if (err) {
      console.error('Error fetching total revenue:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
    res.json(results[0]);
  });
});

// ดึงรายได้รายเดือน
app.get('/getMonthlyRevenue', (req, res) => {
  const { startDate, endDate } = req.query;
  let query = `
    SELECT 
      MONTH(order_datetime) AS month, 
      YEAR(order_datetime) AS year, 
      SUM(Order_detail_price * Order_detail_quantity) AS revenue
    FROM 
      order_detail od
    JOIN
      \`order\` o ON od.Order_id = o.Order_id
  `;
  const params = [];

  if (startDate && endDate) {
    query += ' WHERE o.order_datetime BETWEEN ? AND ?';
    params.push(startDate, endDate);
  }

  query += `
    GROUP BY YEAR(order_datetime), MONTH(order_datetime)
    ORDER BY YEAR(order_datetime), MONTH(order_datetime)
  `;

  connection.query(query, params, (err, results) => {
    if (err) {
      console.error('Error fetching monthly revenue:', err);
      res.status(500).json({ error: 'server error' });
      return;
    }
    res.json(results);
  });
});

// ดึงเมนูเส้นก๋วยเตี๋ยวที่ถูกสั่งเยอะที่สุด
app.get('/getTopNoodleMenus', (req, res) => {
  const { startDate, endDate } = req.query;
  let query = `
    SELECT 
      CONCAT(nt.noodle_type_name, ' ', s.soup_name, ' ', mt.meat_name, ' ', sz.size_name) AS menu_name,
      SUM(od.Order_detail_quantity) AS total_quantity
    FROM 
      order_detail od
    JOIN noodle_type nt ON od.Noodle_type_id = nt.noodle_type_id
    JOIN soup s ON od.Soup_id = s.soup_id
    JOIN meat mt ON od.Meat_id = mt.meat_id
    JOIN size sz ON od.Size_id = sz.size_id
    JOIN \`order\` o ON od.Order_id = o.Order_id
  `;
  const params = [];

  if (startDate && endDate) {
    query += ' WHERE o.order_datetime BETWEEN ? AND ?';
    params.push(startDate, endDate);
  }

  query += `
    GROUP BY od.Noodle_type_id, od.Soup_id, od.Meat_id, od.Size_id
    ORDER BY total_quantity DESC
    LIMIT 5
  `;

  connection.query(query, params, (err, results) => {
    if (err) {
      console.error('Error fetching top noodle menus:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
    res.json(results);
  });
});

// ดึงข้อมูล Dine-in / Take-home
app.get('/order-analytics', (req, res) => {
  const { startDate, endDate } = req.query;
  let query = `
    SELECT 
      SUM(CASE WHEN o.order_takehome = 0 THEN 1 ELSE 0 END) as dineInCount,
      SUM(CASE WHEN o.order_takehome = 1 THEN 1 ELSE 0 END) as takeHomeCount,
      COUNT(*) as totalOrders
    FROM order_detail od
    JOIN \`order\` o ON od.Order_id = o.Order_id
  `;
  const params = [];

  if (startDate && endDate) {
    query += ' WHERE o.order_datetime BETWEEN ? AND ?';
    params.push(startDate, endDate);
  }

  connection.query(query, params, (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Failed to fetch order data' });
    }

    const data = results[0];
    res.json({
      dineIn: data.dineInCount || 0,
      takeHome: data.takeHomeCount || 0,
      total: data.totalOrders || 0
    });
  });
});

// ดึงเส้นก๋วยเตี๋ยวที่ถูกสั่งมากที่สุด
app.get('/mostordernoodletype', (req, res) => {
  const { startDate, endDate } = req.query;
  let query = `
    SELECT 
      NT.Noodle_type_name as name,
      COUNT(*) as order_count
    FROM order_detail od
    JOIN noodle_type NT ON od.Noodle_type_id = NT.Noodle_type_id
    JOIN \`order\` o ON od.Order_id = o.Order_id
  `;
  const params = [];

  if (startDate && endDate) {
    query += ' WHERE o.order_datetime BETWEEN ? AND ?';
    params.push(startDate, endDate);
  }

  query += `
    GROUP BY NT.Noodle_type_id, NT.Noodle_type_name
    ORDER BY order_count DESC
    LIMIT 1
  `;

  connection.query(query, params, (err, results) => {
    if (err) {
      console.log('ไม่สามารถดึงข้อมูลเส้นที่ถูกสั่งมากที่สุดได้', err);
      res.status(500).json({ error: 'server error' });
      return;
    }
    res.json(results[0]);
  });
});

// ดึงน้ำซุปที่ถูกสั่งมากที่สุด
app.get('/mostordersoup', (req, res) => {
  const { startDate, endDate } = req.query;
  let query = `
    SELECT 
      s.soup_name as name,
      COUNT(*) as order_count
    FROM order_detail od
    JOIN soup s ON od.soup_id = s.soup_id
    JOIN \`order\` o ON od.Order_id = o.Order_id
  `;
  const params = [];

  if (startDate && endDate) {
    query += ' WHERE o.order_datetime BETWEEN ? AND ?';
    params.push(startDate, endDate);
  }

  query += `
    GROUP BY s.soup_id, s.soup_name
    ORDER BY order_count DESC
    LIMIT 1
  `;

  connection.query(query, params, (err, results) => {
    if (err) {
      console.log('ไม่สามารถดึงข้อมูลซุปที่ถูกสั่งมากที่สุดได้', err);
      res.status(500).json({ error: 'server error' });
      return;
    }
    res.json(results[0]);
  });
});

// ดึงข้อมูลทุกเส้น
app.get('/allnoodletypes', (req, res) => {
  const { startDate, endDate } = req.query;
  let query = `
    SELECT 
      NT.Noodle_type_name as name,
      COUNT(*) as order_count
    FROM order_detail od
    JOIN noodle_type NT ON od.NOODLE_TYPE_ID = NT.NOODLE_TYPE_ID
    JOIN \`order\` o ON od.Order_id = o.Order_id
  `;
  const params = [];

  if (startDate && endDate) {
    query += ' WHERE o.order_datetime BETWEEN ? AND ?';
    params.push(startDate, endDate);
  }

  query += `
    GROUP BY NT.NOODLE_TYPE_ID, NT.Noodle_type_name
    ORDER BY order_count DESC
  `;

  connection.query(query, params, (err, results) => {
    if (err) {
      console.log('ไม่สามารถดึงข้อมูลเส้นได้', err);
      res.status(500).json({ error: 'server error' });
      return;
    }
    res.json(results);
  });
});

// ดึงข้อมูลทุกซุป
app.get('/allsoups', (req, res) => {
  const { startDate, endDate } = req.query;
  let query = `
    SELECT 
      s.soup_name as name,
      COUNT(*) as order_count
    FROM order_detail od
    JOIN soup s ON od.soup_id = s.soup_id
    JOIN \`order\` o ON od.Order_id = o.Order_id
  `;
  const params = [];

  if (startDate && endDate) {
    query += ' WHERE o.order_datetime BETWEEN ? AND ?';
    params.push(startDate, endDate);
  }

  query += `
    GROUP BY s.soup_id, s.soup_name
    ORDER BY order_count DESC
  `;

  connection.query(query, params, (err, results) => {
    if (err) {
      console.log('ไม่สามารถดึงข้อมูลน้ำซุปได้', err);
      res.status(500).json({ error: 'server error' });
      return;
    }
    res.json(results);
  });
});

// ดึงข้อมูลทุกเนื้อ
app.get('/allmeats', (req, res) => {
  const { startDate, endDate } = req.query;
  let query = `
    SELECT 
      m.meat_name as name,
      COUNT(*) as order_count
    FROM order_detail od
    JOIN meat m ON od.meat_id = m.meat_id
    JOIN \`order\` o ON od.Order_id = o.Order_id
  `;
  const params = [];

  if (startDate && endDate) {
    query += ' WHERE o.order_datetime BETWEEN ? AND ?';
    params.push(startDate, endDate);
  }

  query += `
    GROUP BY m.meat_id, m.meat_name
    ORDER BY order_count DESC
  `;

  connection.query(query, params, (err, results) => {
    if (err) {
      console.log('ไม่สามารถดึงข้อมูลเนื้อสัตว์ได้', err);
      res.status(500).json({ error: 'server error' });
      return;
    }
    res.json(results);
  });
});

// ดึงข้อมูลทุกขนาด
app.get('/allsizes', (req, res) => {
  const { startDate, endDate } = req.query;
  let query = `
    SELECT 
      s.size_name as name,
      COUNT(*) as order_count
    FROM order_detail od
    JOIN size s ON od.size_id = s.size_id
    JOIN \`order\` o ON od.Order_id = o.Order_id
  `;
  const params = [];

  if (startDate && endDate) {
    query += ' WHERE o.order_datetime BETWEEN ? AND ?';
    params.push(startDate, endDate);
  }

  query += `
    GROUP BY s.size_id, s.size_name
    ORDER BY order_count DESC
  `;

  connection.query(query, params, (err, results) => {
    if (err) {
      console.log('ไม่สามารถดึงข้อมูลขนาดได้', err);
      res.status(500).json({ error: 'server error' });
      return;
    }
    res.json(results);
  });
});


app.post('/addmenutocart', (req, res) => {
  const { id, price, quantity, homeDelivery, additionalInfo, orderId } = req.body;
  const query = `
    INSERT INTO cart (Menu_id, Price, Quantity, HomeDelivery, Additional, Order_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  connection.query(query, [id, price, quantity, homeDelivery, additionalInfo, orderId], (err, results) => {
    if (err) {
      console.error('Error adding menu to cart:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
    res.json({ message: 'Menu added to cart successfully', quantity });
  });
});

app.post('/addnoodletocart', (req, res) => {
  const { noodle_type_id, soup_id, meat_id, size_id, price, quantity, homeDelivery, additionalInfo, orderId } = req.body;
  const query = `
    INSERT INTO cart (Noodle_type_id, Soup_id, Meat_id,Size_id,Price, Quantity, HomeDelivery, Additional, Order_id)
    VALUES (?,?,?,?,?, ?, ?, ?, ?)
  `;
  connection.query(query, [noodle_type_id, soup_id, meat_id, size_id, price, quantity, homeDelivery, additionalInfo, orderId], (err, results) => {
    if (err) {
      console.error('Error adding noodle to cart:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
    res.json({ message: 'Noodle added to cart successfully', quantity });
  });
});

app.get('/cart/:id', (req, res) => {
  const orderId = req.params.id;
  const query = `
    SELECT cart.*, noodle_type.*, soup.*, meat.*, size.*, menu.*
    FROM cart
    LEFT JOIN noodle_type ON cart.Noodle_type_id = noodle_type.Noodle_type_id
    LEFT JOIN soup ON cart.Soup_id = soup.Soup_id
    LEFT JOIN meat ON cart.Meat_id = meat.Meat_id
    LEFT JOIN size ON cart.Size_id = size.Size_id
    LEFT JOIN menu ON cart.Menu_id = menu.Menu_id
    WHERE Order_id = ?
  `;
  connection.query(query, [orderId], (err, results) => {
    if (err) {
      console.error('Error fetching cart:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
    res.json(results);
  });
})

app.put('/cart/increase/:id', (req, res) => {
  const { id } = req.params;
  const { quantity } = req.body;
  const query = `UPDATE cart SET Quantity = ? WHERE Cart_id = ?`;
  connection.query(query, [quantity, id], (err, results) => {
    if (err) {
      console.log('error increase quantity:', err);
      res.json({ error: 'Internal server error' });
      return;
    } console.log('increase quantity successfully')
    res.json({ message: 'Quantity increased successfully' });
  })
})

app.put('/cart/decrease/:id', (req, res) => {
  const { id } = req.params;
  const { quantity } = req.body;
  const query = `UPDATE cart SET Quantity = ? WHERE Cart_id = ?`;
  connection.query(query, [quantity, id], (err, results) => {
    if (err) {
      console.error('error decrease quantitiy:', err);
      res.json({ error: 'Internal server error' });
      return;
    } res.json({ message: 'Quantity decreased successfully' });
  });
});

app.delete('/cart/delete/:id', (req, res) => {
  const { id } = req.params;
  const query = `DELETE FROM cart WHERE Cart_id = ?`;
  connection.query(query, [id], (err, results) => {
    if (err) {
      console.error('Error deleting cart item:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
    res.json({ message: 'Item removed from cart successfully' });
  });
});

app.delete('/cart/order/:id', (req, res) => {
  const { id } = req.params;
  const query = `DELETE FROM cart WHERE Order_id = ?`;
  connection.query(query, [id], (err, results) => {
    if (err) {
      console.error('Error deleting cart item:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
    res.json({ message: 'Item removed from cart successfully' });
  });
});

app.get('/gettotalcartitems/:id', (req, res) => {
  const orderId = req.params.id;
  const query = `
    SELECT SUM(Quantity) AS total_items
    FROM cart
    WHERE Order_id = ?
  `;
  connection.query(query, [orderId], (err, results) => {
    if (err) {
      console.error('Error fetching total cart items:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
    const totalItems = results[0]?.total_items || 0;
    res.json({ total_items: totalItems });
  });
});

app.get('/getpromotions', (req, res) => {
  // SQL query to get all promotions, ordered by newest first
  const query = 'SELECT * FROM promotion ORDER BY Promotion_id DESC';

  connection.query(query, (error, results) => {
    if (error) {
      console.error('Error fetching promotions:', error);
      res.status(500).json({ status: 'error', message: error.message });
      return;
    }

    res.json(results);
  });
});

app.get('/getpromotiondetails/:promotionId', (req, res) => {
  const { promotionId } = req.params;

  if (!promotionId || isNaN(promotionId)) {
    return res.status(400).json({ status: 'error', message: 'Valid promotion ID is required' });
  }
  const query = `
    SELECT pmi.Promotion_Menu_Item_id, pmi.Promotion_id, pmi.Menu_id, pmi.Noodlemenu,
           m.Menu_name
    FROM promotion_menu_item pmi
    LEFT JOIN menu m ON pmi.Menu_id = m.Menu_id
    WHERE pmi.Promotion_id = ?
  `;

  connection.query(query, [promotionId], (error, results) => {
    if (error) {
      console.error('Error fetching promotion details:', error);
      res.status(500).json({ status: 'error', message: error.message });
      return;
    }

    // If no results found
    if (results.length === 0) {
      return res.json([]);
    }

    res.json(results);
  });
});

app.post('/addpromotion', (req, res) => {
  const { promotionName, discount, startDate, endDate, menuType, includeNoodleMenu } = req.body;


  if (!promotionName) {
    return res.status(400).json({ status: 'error', message: 'Promotion name is required' });
  }

  if (!discount || isNaN(discount)) {
    return res.status(400).json({ status: 'error', message: 'Discount value is required and must be a number' });
  }

  if (!startDate) {
    return res.status(400).json({ status: 'error', message: 'Start date is required' });
  }

  if (!endDate) {
    return res.status(400).json({ status: 'error', message: 'End date is required' });
  }


  const insertPromotionQuery = 'INSERT INTO promotion (Promotion_name, Discount_value, Start_date, End_date) VALUES (?, ?, ?, ?)';
  connection.query(insertPromotionQuery, [promotionName, discount, startDate, endDate], (error, results) => {
    if (error) {
      console.error('Error adding promotion:', error);
      res.status(500).json({ status: 'error', message: error.message });
      return;
    }

    const promotionId = results.insertId;
    const menuItemPromises = [];


    if (menuType && Array.isArray(menuType)) {
      menuType.forEach(menuId => {

        if (menuId) {
          const insertMenuItemQuery = 'INSERT INTO promotion_menu_item (Promotion_id, Menu_id) VALUES (?, ?)';

          const promise = new Promise((resolve, reject) => {
            connection.query(insertMenuItemQuery, [promotionId, menuId], (menuItemError) => {
              if (menuItemError) {
                reject(menuItemError);
                return;
              }
              resolve();
            });
          });

          menuItemPromises.push(promise);
        }
      });
    }


    if (includeNoodleMenu) {
      const insertNoodlePromotionQuery = `
        INSERT INTO promotion_menu_item 
        (Promotion_id, Menu_id, Noodlemenu) 
        VALUES (?, NULL, ?)
      `;

      const noodlePromise = new Promise((resolve, reject) => {
        connection.query(insertNoodlePromotionQuery, [promotionId, 1], (noodleError) => {
          if (noodleError) {
            reject(noodleError);
            return;
          }
          resolve();
        });
      });

      menuItemPromises.push(noodlePromise);
    }

    Promise.all(menuItemPromises)
      .then(() => {
        res.json({
          status: 'ok',
          message: 'Promotion and menu items added successfully',
          promotionId
        });
      })
      .catch(insertError => {
        console.error('Error inserting promotion items:', insertError);
        // Clean up by deleting the promotion if any item insertion fails
        const deletePromotionQuery = 'DELETE FROM promotion WHERE Promotion_id = ?';
        connection.query(deletePromotionQuery, [promotionId], () => {
          res.status(500).json({
            status: 'error',
            message: insertError.message,
            details: 'Failed to link menu items to promotion.'
          });
        });
      });
  });
});

app.get('/getactivepromotions', (req, res) => {
  const currentDate = new Date().toISOString().slice(0, 19).replace('T', ' ');

  const query = `
    SELECT * FROM promotion 
    WHERE Start_date <= ?  AND End_date >= ?
  `;

  connection.query(query, [currentDate, currentDate], (error, results) => {
    if (error) {
      console.error('Error fetching active promotions:', error);
      res.status(500).json({ status: 'error', message: error.message });
      return;
    }

    res.json(results);
  });
});


app.get('/getpromotionitems/:promotionId', (req, res) => {
  const { promotionId } = req.params;

  if (!promotionId || isNaN(promotionId)) {
    return res.status(400).json({ status: 'error', message: 'Valid promotion ID is required' });
  }

  const query = `
    SELECT * FROM promotion_menu_item 
    WHERE Promotion_id = ?
  `;

  connection.query(query, [promotionId], (error, results) => {
    if (error) {
      console.error('Error fetching promotion items:', error);
      res.status(500).json({ status: 'error', message: error.message });
      return;
    }

    // If there are noodle type combinations, get the details for them
    const noodlePromotions = results.filter(item =>
      item.noodle_type_id || item.soup_id || item.meat_id || item.size_id
    );

    if (noodlePromotions.length > 0) {

      const noodleDetailsPromises = noodlePromotions.map(item => {
        return new Promise((resolve) => {
          resolve(item);
        });
      });

      Promise.all(noodleDetailsPromises)
        .then(detailedItems => {

          const finalResults = results.map(item => {
            const detailedItem = detailedItems.find(di => di.Promotion_Menu_Item_id === item.Promotion_Menu_Item_id);
            return detailedItem || item;
          });

          res.json(finalResults);
        })
        .catch(detailsError => {
          console.error('Error fetching noodle details:', detailsError);
          // Return the basic results if details fetching fails
          res.json(results);
        });
    } else {
      res.json(results);
    }
  });
});

app.put('/updatesize/:id', (req, res) => {
  const { id } = req.params;
  const { size, price } = req.body;

  // Validate input
  if (!size) {
    return res.status(400).json({ status: 'error', message: 'Size name is required' });
  }

  if (!price || isNaN(price)) {
    return res.status(400).json({ status: 'error', message: 'Valid price is required' });
  }

  // Use existing connection instead of creating a new one
  const query = 'UPDATE size SET Size_name = ?, Size_price = ? WHERE Size_id = ?';
  connection.query(query, [size, price, id], (error, results) => {
    if (error) {
      console.error('Error updating size:', error);
      res.status(500).json({ status: 'error', message: error.message });
      return;
    }

    if (results.affectedRows === 0) {
      res.status(404).json({ status: 'error', message: 'Size not found' });
      return;
    }

    res.json({ status: 'ok', message: 'Size updated successfully' });
  });
});

app.put('/updatemeat/:id', (req, res) => {
  const { id } = req.params;
  const { meat, price } = req.body;
  if (!meat) {
    return res.status(400).json({ status: 'error', message: 'Meat name is required' });
  }

  if (!meat || isNaN(price)) {
    return res.status(400).json({ status: 'error', message: 'Meat price is required' });
  }

  const query = 'UPDATE meat SET Meat_name = ?, Meat_price = ? WHERE Meat_id = ?';
  connection.query(query, [meat, price, id], (error, results) => {
    if (error) {
      console.error('Error updating size:', error);
      res.status(500).json({ status: 'error', message: error.message });
      return;
    }

    if (results.affectedRows === 0) {
      res.status(404).json({ status: 'error', message: 'meat not found' });
      return;
    }

    res.json({ status: 'ok', message: 'Size updated successfully' });
  });
});
app.put('/updatenoodletype/:id', (req, res) => {
  const { id } = req.params;
  const { noodlename, price } = req.body;


  if (!noodlename) {
    return res.status(400).json({ status: 'error', message: 'noodle name is required' });
  }

  if (!noodlename || isNaN(price)) {
    return res.status(400).json({ status: 'error', message: 'noodle price is required' });
  }

  const query = 'UPDATE noodle_type SET Noodle_type_name = ?, Noodle_type_price = ? WHERE Noodle_type_id = ?';
  connection.query(query, [noodlename, price, id], (error, results) => {
    if (error) {
      console.error('Error updating size:', error);
      res.status(500).json({ status: 'error', message: error.message });
      return;
    }

    if (results.affectedRows === 0) {
      res.status(404).json({ status: 'error', message: 'noodle not found' });
      return;
    }

    res.json({ status: 'ok', message: 'noodle updated successfully' });
  });
});
app.put('/updatesoup/:id', (req, res) => {
  const { id } = req.params;
  const { soup, price } = req.body;


  if (!soup) {
    return res.status(400).json({ status: 'error', message: 'Soup name is required' });
  }

  if (!soup || isNaN(price)) {
    return res.status(400).json({ status: 'error', message: 'Soup price is required' });
  }

  const query = 'UPDATE soup SET Soup_name = ?, Soup_price = ? WHERE Soup_id = ?';
  connection.query(query, [soup, price, id], (error, results) => {
    if (error) {
      console.error('Error updating soup:', error);
      res.status(500).json({ status: 'error', message: error.message });
      return;
    }

    if (results.affectedRows === 0) {
      res.status(404).json({ status: 'error', message: 'soup not found' });
      return;
    }

    res.json({ status: 'ok', message: 'Soup updated successfully' });
  });
});

/*app.put('/updatepromotion/:id' , (req, res) => {
  const promotionId = req.params.id;
  const {promotionName , discount , startDate , enddate , menutype , includeNoodleMenu} = req.body;

  if (!promotionName) {
    return res.status(400).json({ status: 'error', message: 'Promotion name is required' });
  }
  
  if (!discount || isNaN(discount)) {
    return res.status(400).json({ status: 'error', message: 'Discount value is required and must be a number' });
  }
  
  if (!startDate) {
    return res.status(400).json({ status: 'error', message: 'Start date is required' });
  }
  
  if (!endDate) {
    return res.status(400).json({ status: 'error', message: 'End date is required' });
  }

  const query = 'UPDATE promotion ( Promotion_name, Discount_value ,Start_date , End_date) VALUES (?, ?, ?,?)  ';
});*/

app.put('/updatepromotion/:id', jsonParser, async (req, res) => {
  try {
    const promotionId = req.params.id;
    const { promotionName, discount, startDate, endDate, menuTypes, includeNoodleMenu } = req.body;


    const promiseConnection = connection.promise();


    await promiseConnection.beginTransaction();

    try {

      await promiseConnection.execute(
        `UPDATE promotion 
         SET Promotion_name = ?, 
             Discount_value = ?, 
             Start_date = ?, 
             End_date = ? 
         WHERE Promotion_id = ?`,
        [promotionName, discount, startDate, endDate, promotionId]
      );


      await promiseConnection.execute(
        'DELETE FROM promotion_menu_item WHERE Promotion_id = ?',
        [promotionId]
      );

      if (menuTypes && menuTypes.length > 0) {
        const insertMenuPromises = menuTypes.map(menuId => {
          return promiseConnection.execute(
            'INSERT INTO promotion_menu_item (Promotion_id, Menu_id) VALUES (?, ?)',
            [promotionId, menuId]
          );
        });

        await Promise.all(insertMenuPromises);
      }


      if (includeNoodleMenu) {
        await promiseConnection.execute(
          'INSERT INTO promotion_menu_item (Promotion_id, Noodlemenu) VALUES (?, ?)',
          [promotionId, 1]
        );
      }


      await promiseConnection.commit();

      res.status(200).json({
        status: 'ok',
        message: 'Promotion updated successfully',
        promotionId
      });

    } catch (err) {

      await promiseConnection.rollback();
      throw err;
    }
  } catch (error) {
    console.error(`Error updating promotion ${req.params.id}:`, error);
    res.status(500).json({
      status: 'error',
      message: `Failed to update promotion ${req.params.id}`,
      error: error.message
    });
  }
});

app.delete('/deletepromotion/:id', async (req, res) => {
  try {
    const promotionId = req.params.id;
    const promiseConnection = connection.promise();
    await promiseConnection.beginTransaction();
    try {

      await promiseConnection.execute(
        'DELETE FROM promotion_menu_item WHERE Promotion_id = ?',
        [promotionId]
      );

      const [result] = await promiseConnection.execute(
        'DELETE FROM promotion WHERE Promotion_id = ?',
        [promotionId]
      );

      if (result.affectedRows === 0) {
        await promiseConnection.rollback();
        return res.status(404).json({
          status: 'error',
          message: `Promotion with ID ${promotionId} not found`
        });
      }


      await promiseConnection.commit();

      res.status(200).json({
        status: 'ok',
        message: 'Promotion deleted successfully',
        promotionId
      });

    } catch (err) {

      await promiseConnection.rollback();
      throw err;
    }
  } catch (error) {
    console.error(`Error deleting promotion ${req.params.id}:`, error);
    res.status(500).json({
      status: 'error',
      message: `Failed to delete promotion ${req.params.id}`,
      error: error.message
    });
  }
});

app.get('/order/:id', (req, res) => {
  const tableId = req.params.id;
  const query = `
    SELECT * 
    FROM \`order\`
    WHERE tables_id = ?
    ORDER BY Order_datetime DESC
    LIMIT 1
  `;

  connection.execute(query, [tableId], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error retrieving order' });
    }

    if (!results) {
      return res.status(404).json({ error: 'No order found' });
    }

    res.status(200).json(results[0]);
  });
});

app.get('/tableandorder', (req, res) => {
  const query = `
    SELECT t.tables_id, t.tables_number, t.status_id, MAX(o.Order_id) AS latest_order_id
FROM \`tables\` t
LEFT JOIN \`order\` o ON o.tables_id = t.tables_id
GROUP BY t.tables_id, t.tables_number, t.status_id;

  `;

  connection.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching tables and orders:', err);
      return res.status(500).json({ error: "Error fetching" });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: "No data found" });
    }

    res.status(200).json(results);
  });
});


app.delete('/deleteLatestOrder/:tables_id', (req, res) => {
  const { tables_id } = req.params;
  const getLatestOrderQuery = `
      SELECT Order_id
      FROM \`order\`
      WHERE tables_id = ?
      ORDER BY Order_datetime DESC
      LIMIT 1;
  `;

  connection.query(getLatestOrderQuery, [tables_id], (err, results) => {
      if (err) {
          console.error('Error fetching latest order:', err);
          return res.status(500).json({ error: 'Error fetching latest order' });
      }

      if (results.length === 0) {
          return res.status(404).json({ error: 'No orders found for this table' });
      }

      const latestOrderId = results[0].Order_id;
      const deleteOrderQuery = 'DELETE FROM `order` WHERE Order_id = ?';

      connection.query(deleteOrderQuery, [latestOrderId], (err) => {
          if (err) {
              console.error('Error deleting order:', err);
              return res.status(500).json({ error: 'Error deleting order' });
          }

          res.status(200).json({ message: `Order #${latestOrderId} deleted successfully` });
      });
  });
});



PORT = process.env.PORT || 3333;
/*
DB_HOST=mysql.railway.internal
DB_USER=root
DB_PASSWORD=GijePtxifRrLfnZGwwsuIwulKsJRvkuT
DB_NAME=railway
DB_PORT=3306
PORT=3333

*/

app.listen(PORT, () => {
  console.log('App.js web server listening on port ', PORT, 'Host:', process.env.DB_HOST);
});
