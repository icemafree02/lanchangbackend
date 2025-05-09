const express = require('express');
const router = express.Router();

const { read, post, readID, readnamtok, readnamsai, readdrynoodle} = require('../Controllers/noodle_menu');
const { getImage } = require('../Controllers/noodle_image');

router.get('/noodle', read);
router.get('/noodle/:id', readID);
router.get('/noodleimage/:id', getImage);

router.get('/namtok',readnamtok);
router.get('/namsai',readnamsai);
router.get('/drynoodle',readdrynoodle);

router.post('/noodle',post);


module.exports = router;
