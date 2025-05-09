const express = require('express')
const router = express.Router()

const { read,readID, orders, orderID, callstaff,addItemsToOrder, updateOrder, getOrder,getAssociation } = require('../Controllers/menu')
const { getImage } = require('../Controllers/menu_image');

router.get('/menu', read);
router.get('/menu/:id', readID);
router.get('/menuimage/:id', getImage);
router.get('/getorder',getOrder)
router.get('/association',getAssociation)
router.get('/orders/:orderId',orderID)

router.post('/orders',orders)

router.put('/orders/:orderId',updateOrder)
router.put('/orders/:orderId/callstaff',callstaff)
router.put('/orders/:orderId/add_items', addItemsToOrder);


module.exports = router
