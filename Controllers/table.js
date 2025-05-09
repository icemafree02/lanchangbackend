const db = require("../Controllers/db");

exports.read = async (req, res) => {
    try {
        db.query('SELECT * FROM `tables` ', (error, results) => {
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
    if (!id) {
        return res.status(400).send('ID is required');
    }

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
        const results = await query('SELECT * FROM tables WHERE tables_id = ?', [id]);

        if (results.length === 0) {
            return res.status(404).send('No table found');
        }
        res.status(200).json(results[0]);
    } catch (err) {
        console.error('Server error:', err);
        res.status(500).send('Server error');
    }
};

exports.postID = async (req, res) => {
    const id = req.params.id; // Table ID from the request parameters
    if (!id) {
        return res.status(400).send('ID is required');
    }

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
        
        const result = await query('UPDATE tables SET status_id = ? WHERE tables_id = ?', ['2', id]);

        if (result.affectedRows === 0) {
            return res.status(404).send('No table found to update');
        }
        
        const updatedTable = await query('SELECT * FROM tables WHERE tables_id = ?', [id]);

        res.status(200).json(updatedTable[0]);
    } catch (err) {
        console.error('Server error:', err);
        res.status(500).send('Server error');
    }
};







