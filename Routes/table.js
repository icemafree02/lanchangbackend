const express = require('express')
const router = express.Router()

const { read, readID, postID } = require('../Controllers/table')


router.get('/table', read)
router.get('/table/:id', readID)

router.post('/table/:id',postID);

module.exports = router
