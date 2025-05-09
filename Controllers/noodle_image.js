const db = require("../Controllers/db");

exports.getImage = async (req, res) => {
    const imageId = req.params.id;

    try {
        db.query('SELECT noodle_menu_picture FROM noodle_menu WHERE noodle_menu_id = ?', [imageId], (error, results) => {
            if (error) {
                console.error('Error executing query:', error);
                return res.status(500).send('Database query error');
            }

            if (results.length === 0) {
                return res.status(404).send('Image not found');
            }

            const imageBlob = results[0].noodle_menu_picture;
            res.set('Content-Type', 'image/jpeg');
            res.send(imageBlob);
        });
    } catch (err) {
        console.error('Server error:', err);
        res.status(500).send('Server error');
    }
};

  
