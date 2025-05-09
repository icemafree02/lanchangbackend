const db = require("../Controllers/db");

exports.read = async (req, res) => {
    try {
        db.query('SELECT * FROM `noodle_menu` ', (error, results) => {
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

exports.post = async (req, res) => {
    try {
        const { noodleType, soupType, meatType, size } = req.body;
        db.query(
            `SELECT * , 
                (noodle_type.Noodle_type_price + 
                 soup.soup_price + 
                 meat.meat_price + 
                 size.size_price) as Total_price
             FROM noodle_type, soup, meat,size
             WHERE noodle_type.noodle_type_id = ? 
               AND soup.soup_id = ?
               AND meat.meat_id = ?
               AND size.size_id = ?`,
            [noodleType, soupType, meatType, size],
            (error, results) => {
                if (error) {
                    console.error('Error query noodle:', error.message);
                    return res.status(500).json({ error: `Database query error: ${error.message}` });
                }
                console.log(results);
                res.status(200).json(results);
            }

        );
    } catch (err) {
        console.error('Server error:', err.message);
        res.status(500).json({ error: `Server error: ${err.message}` });
    }
};


exports.readnamtok = async (req, res) => {
    try {
        const keyword = '%น้ำตก%';
        db.query('SELECT * FROM `noodle_menu` WHERE `noodle_menu_name` LIKE ?', [keyword], (error, results) => {
            if (error) {
                console.error('Error executing query:', error.message);
                return res.status(500).send(`Database query error: ${error.message}`);
            }
            res.status(200).json(results);
        });
    } catch (err) {
        console.error('Server error:', err.message);
        res.status(500).send(`Server error: ${err.message}`);
    }
};

exports.readnamsai = async (req, res) => {
    try {
        const keyword = '%น้ำใส%';
        db.query('SELECT * FROM `noodle_menu` WHERE `noodle_menu_name` LIKE ?', [keyword], (error, results) => {
            if (error) {
                console.error('Error executing query:', error.message);
                return res.status(500).send(`Database query error: ${error.message}`);
            }
            res.status(200).json(results);
        });
    } catch (err) {
        console.error('Server error:', err.message);
        res.status(500).send(`Server error: ${err.message}`);
    }
};

exports.readdrynoodle = async (req, res) => {
    try {
        const keyword = '%แห้ง%';
        db.query('SELECT * FROM `noodle_menu` WHERE `noodle_menu_name` LIKE ?', [keyword], (error, results) => {
            if (error) {
                console.error('Error executing query:', error.message);
                return res.status(500).send(`Database query error: ${error.message}`);
            }
            res.status(200).json(results);
        });
    } catch (err) {
        console.error('Server error:', err.message);
        res.status(500).send(`Server error: ${err.message}`);
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
        const results = await query('SELECT * FROM noodle_menu WHERE noodle_menu_id = ?', [id]);

        if (results.length === 0) {
            return res.status(404).send('No data found');
        }

        res.status(200).json(results[0]);
    } catch (err) {
        console.error('Server error:', err);
        res.status(500).send('Server error');
    }
};

exports.readdrynoodle = async (req, res) => {
    try {
        const keyword = '%แห้ง%';
        db.query('SELECT * FROM `noodle_menu` WHERE `noodle_menu_name` LIKE ?', [keyword], (error, results) => {
            if (error) {
                console.error('Error executing query:', error.message);
                return res.status(500).send(`Database query error: ${error.message}`);
            }
            res.status(200).json(results);
        });
    } catch (err) {
        console.error('Server error:', err.message);
        res.status(500).send(`Server error: ${err.message}`);
    }
};


exports.postselectednoodle = async (req, res) => {
    req.session.Noodle = req.body.Noodle;
    res.sendStatus(200);
}

exports.readselectednoodle = async (req, res) => {
    res.json({ Noodle: req.session.Noodle });
}








