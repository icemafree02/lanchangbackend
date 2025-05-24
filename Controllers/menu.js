const db = require("../Controllers/db");
const connection = require("../Controllers/association");
const { spawn } = require('child_process');
const path = require('path');
const { exec } = require('child_process');
const { installPythonDependencies } = require('./install-python-deps');

// Dynamically detect Python path
let pythonPath = '/root/.nix-profile/bin/python3'; // default fallback
let dependenciesInstalled = false;

// Check for available Python installations and set the correct path
exec('which python3', (err, stdout) => {
  if (!err && stdout.trim()) {
    pythonPath = stdout.trim();
    console.log('Found python3 at:', pythonPath);
  } else {
    console.log('python3 not found via which command');
  }
});

exec('which python', (err, stdout) => {
  console.log('python path:', stdout.trim());
});

// Install Python dependencies on startup
installPythonDependencies().then(success => {
  dependenciesInstalled = success;
  if (success) {
    console.log('Python dependencies are ready');
  } else {
    console.error('Failed to install Python dependencies');
  }
}).catch(error => {
  console.error('Error during Python dependency installation:', error);
});

exports.read = async (req, res) => {
  try {
    db.query('SELECT * FROM `menu` ', (error, results) => {
      if (error) {
        console.error('Error executing query:', error);
        return res.status(500).send('Database query error');
      }
      res.status(200).json(results);
    });
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).send('Server error');
  }
};

exports.getOrder = async (req, res) => {
  try {
    db.query('SELECT * FROM `order` ', (error, results) => {
      if (error) {
        console.error('Error executing query:', error);
        return res.status(500).send('Database query error');
      }
      res.status(200).json(results);
    });
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).send('Server error');
  }
};

exports.readID = async (req, res) => {
  const id = req.params.id;
  const query = (sql, params) => {
    return new Promise((resolve, reject) => {
      db.query(sql, params, (error, results) => {
        if (error) {
          return reject(error);
        }
        resolve(results);
      });
    });
  };
  try {
    const results = await query('SELECT * FROM menu WHERE menu_id = ?', [id]);

    if (results.length === 0) {
      return res.status(404).send('No data found');
    }

    res.status(200).json(results[0]);
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).send('Server error');
  }
};

exports.orders = (req, res) => {
  const { tableId, cartItems, orderId } = req.body;

  if (orderId) {
    this.updateOrder(req, res);
  } else {
    const createOrderQuery = 'INSERT INTO `order` (tables_id, Order_datetime, status_id) VALUES (?, NOW(), ?)';
    const createOrderValues = [tableId, '3'];

    db.query(createOrderQuery, createOrderValues, (err, newOrderResult) => {
      if (err) {
        console.error('Error creating new order:', err);
        return res.status(500).send('Server error creating new order');
      }

      const newOrderId = newOrderResult.insertId;

      if (cartItems && cartItems.length > 0) {
        this.addItemsToOrder(newOrderId, cartItems, res);
      } else {
        res.json({ orderId: newOrderId });
      }
    });
  }
};

exports.updateOrder = (req, res) => {
  const { orderId, cartItems } = req.body;

  if (cartItems && cartItems.length > 0) {
    this.addItemsToOrder(orderId, cartItems, res);
  } else {
    res.json({ message: 'No items to add to the order' });
  }
};

exports.addItemsToOrder = (req, res) => {
  const orderId = parseInt(req.params.orderId);
  const { cartItems } = req.body;

  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    return res.status(400).json({ message: 'No items to add' });
  }

  const insertQuery = `
    INSERT INTO order_detail 
    (
      Order_detail_quantity, 
      Order_detail_price, 
      Order_detail_takehome, 
      Order_detail_additional,
      Order_id, 
      Menu_id, 
      Promotion_Menu_Item_id,
      status_id,
      Soup_id,
      Size_id,
      Meat_id,
      Noodle_type_id, 
      Order_detail_created_at
    ) 
    VALUES ?
  `;

  const values = cartItems.map(item => [
    item.quantity,
    item.price,
    item.homeDelivery || 0,
    item.additionalInfo || null,
    orderId,
    item.type === 'menu' ? item.menuId : null,
    null, // Promotion_Menu_Item_id
    '3',  // status_id
    item.type === 'noodle' && item.noodleDetails ? item.noodleDetails.Soup_id : null,
    item.type === 'noodle' && item.noodleDetails ? item.noodleDetails.Size_id : null,
    item.type === 'noodle' && item.noodleDetails ? item.noodleDetails.Meat_id : null,
    item.type === 'noodle' && item.noodleDetails ? item.noodleDetails.Noodle_type_id : null,
    new Date()
  ]);

  db.query(insertQuery, [values], (err, result) => {
    if (err) {
      console.error('Error adding items to order:', err);
      return res.status(500).json({ message: 'Error adding items to order' });
    }

    return res.status(200).json({ message: 'Items added successfully', inserted: result.affectedRows });
  });
};


exports.orderID = async (req, res) => {
  try {
    const { orderId } = req.params;
    db.query(
      `SELECT 
  od.*, 
  CASE 
    WHEN m.Menu_id IS NOT NULL THEN m.Menu_name
    ELSE CONCAT(nt.Noodle_type_name, ' ', s.Soup_name, ' ', mt.Meat_name, ' ', sz.Size_name)
  END AS name,

  COALESCE(m.Menu_price, od.Order_detail_price) AS base_price,

  p.Promotion_name,
  p.Discount_value

FROM order_detail od
LEFT JOIN menu m ON od.Menu_id = m.Menu_id
LEFT JOIN noodle_type nt ON od.Noodle_type_id = nt.Noodle_type_id
LEFT JOIN soup s ON od.Soup_id = s.Soup_id
LEFT JOIN meat mt ON od.Meat_id = mt.Meat_id
LEFT JOIN size sz ON od.Size_id = sz.Size_id

LEFT JOIN promotion_menu_item pmi 
  ON (
      (pmi.Menu_id IS NOT NULL AND pmi.Menu_id = od.Menu_id) OR
      (pmi.Menu_id IS NULL AND pmi.Noodlemenu = 1 AND od.Menu_id IS NULL)
     )

LEFT JOIN promotion p 
  ON p.Promotion_id = pmi.Promotion_id 
  AND p.Start_date <= NOW() 
  AND p.End_date >= NOW()

WHERE od.Order_id = ?
`,
      [orderId],
      (err, results) => {
        if (err) {
          console.error('Error fetching order details:', err);
          return res.status(500).send('Error fetching order details');
        }
        res.json(results);
      }
    );

  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Server error');
  }
};


exports.callstaff = (req, res) => {
  const orderId = req.params.orderId;
  const orderQuery = 'UPDATE `order` SET status_id = ? WHERE Order_id = ?';
  const detailsQuery = 'UPDATE order_detail SET status_id = ? WHERE Order_id = ? AND status_id = ?';

  db.beginTransaction(err => {
    if (err) {
      console.error('Error beginning transaction:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }

    db.query(orderQuery, ['5', orderId], (err, orderResult) => {
      if (err) {
        return db.rollback(() => {
          console.error('Error updating order status:', err);
          res.status(500).json({ error: 'Internal server error' });
        });
      }
      if (orderResult.affectedRows === 0) {
        return db.rollback(() => {
          res.status(404).json({ message: 'Order not found' });
        });
      }

      db.query(detailsQuery, ['5', orderId, '4'], (err, detailsResult) => {
        if (err) {
          return db.rollback(() => {
            console.error('Error updating order details status:', err);
            res.status(500).json({ error: 'Internal server error' });
          });
        }
        db.commit(err => {
          if (err) {
            return db.rollback(() => {
              console.error('Error committing transaction:', err);
              res.status(500).json({ error: 'Internal server error' });
            });
          }
          res.status(200).json({
            message: 'Order status updated to รอชำระเงิน',
            updatedDetails: detailsResult.affectedRows
          });
        });
      });
    });
  });
};

exports.getAssociation = async (req, res) => {
  try {
    // รับพารามิตเตอร์จาก api
    const minSupport = parseFloat(req.query.min_support || 0.2);
    const minConfidence = parseFloat(req.query.min_confidence || 0.5);
    const minLift = parseFloat(req.query.min_lift || 1.0);
    const startDate = req.query.start_date;
    const endDate = req.query.end_date;

    let query = `
      SELECT 
        order_detail.order_id,
        o.order_datetime,
        COALESCE(menu.menu_name, 'ก๋วยเตี๋ยว') AS item
      FROM order_detail
      LEFT JOIN \`order\` AS o ON order_detail.order_id = o.order_id
      LEFT JOIN menu ON order_detail.menu_id = menu.menu_id
    `;

    // ฟิลเตอร์วันที่
    const queryParams = [];
    if (startDate || endDate) {
      const conditions = [];

      if (startDate) {
        conditions.push('o.order_datetime >= ?');
        queryParams.push(startDate);
      }

      if (endDate) {
        conditions.push('o.order_datetime <= ?');
        queryParams.push(`${endDate} 23:59:59`);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
    }

    query += ' ORDER BY order_detail.order_id, o.order_datetime';

    const [transactions] = await connection.query(query, queryParams);

    if (!transactions || transactions.length === 0) {
      return res.status(200).json({
        success: true,
        transactions: [],
        totalTransactions: 0,
        aprioriResults: {
          frequentItemsets: [],
          associationRules: []
        }
      });
    }

    const groupedOrders = new Map();
    transactions.forEach(({ order_id, order_datetime, item }) => {
      if (!groupedOrders.has(order_id)) {
        groupedOrders.set(order_id, {
          orderId: order_id,
          date: order_datetime,
          items: [],
        });
      }
      groupedOrders.get(order_id).items.push(item);
    });

    const transactionList = Array.from(groupedOrders.values());

    // รอรับผลจาก apriori         //รันฟังชัน
    const aprioriResults = await runPythonAprioriWithData(
      transactionList,
      minSupport,
      minConfidence,
      minLift
    );
    //ส่งค่ากลับ api
    return res.status(200).json({
      success: true,
      transactions: transactionList,
      totalTransactions: transactionList.length,
      aprioriResults: aprioriResults
    });

  } catch (error) {
    console.error('Error in getAssociation:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      details: error.message,
    });
  }
};
// ฟังชัน apriori รับออเดอร์และค่าต่างๆมา
function runPythonAprioriWithData(transactions, minSupport, minConfidence, minLift) {
  return new Promise(async (resolve, reject) => {
    const pythonScriptPath = path.join(__dirname, './run_apriori.py');
    console.log('Python script path:', pythonScriptPath);
    
    // Ensure dependencies are installed before proceeding
    if (!dependenciesInstalled) {
      console.log('Dependencies not ready, attempting installation...');
      try {
        const installed = await installPythonDependencies();
        if (!installed) {
          reject(new Error('Failed to install Python dependencies'));
          return;
        }
        dependenciesInstalled = true;
      } catch (error) {
        reject(new Error(`Dependency installation error: ${error.message}`));
        return;
      }
    }
    
    // Detect Python path at runtime
    exec('which python3', (err, stdout) => {
      let detectedPythonPath = pythonPath; // use the global fallback
      
      if (!err && stdout.trim()) {
        detectedPythonPath = stdout.trim();
      }
      
      console.log('Using Python path:', detectedPythonPath);

      // Test if Python and required modules are available
      const testPython = spawn(detectedPythonPath, ['-c', 'import pandas; import mlxtend; print("Modules available")'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let testError = '';
      testPython.stderr.on('data', (data) => {
        testError += data.toString();
      });

      testPython.on('close', (testCode) => {
        if (testCode !== 0) {
          console.error('Python modules test failed:', testError);
          reject(new Error(`Required Python modules not available: ${testError}`));
          return;
        }

        console.log('Python modules test passed');

        // If test passes, run the actual script
        const pythonProcess = spawn(detectedPythonPath, [pythonScriptPath], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
        });

        // Send data to script
        const inputData = JSON.stringify({
          transactions: transactions.map(t => t.items),
          minSupport,
          minConfidence,
          minLift
        });

        pythonProcess.stdin.write(inputData);
        pythonProcess.stdin.end();

        let resultData = '';
        let errorData = '';

        // Collect data from script
        pythonProcess.stdout.on('data', (data) => {
          resultData += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
          errorData += data.toString();
        });

        // Handle script completion
        pythonProcess.on('close', (code) => {
          if (code !== 0) {
            console.error(`Python script exited with code ${code}`);
            console.error(`Error: ${errorData}`);
            reject(new Error(`Python script error: ${errorData}`));
          } else {
            try {
              const results = JSON.parse(resultData);
              if (results.error) {
                reject(new Error(results.error));
              } else {
                resolve(results);
              }
            } catch (err) {
              console.error('Raw Python output:', resultData);
              reject(new Error(`Failed to parse Python output: ${err.message}`));
            }
          }
        });

        pythonProcess.on('error', (err) => {
          console.error('Failed to start Python process:', err);
          reject(new Error(`Failed to start Python process: ${err.message}`));
        });
      });

      testPython.on('error', (err) => {
        console.error('Failed to test Python:', err);
        reject(new Error(`Failed to test Python: ${err.message}`));
      });
    });
  });
}









