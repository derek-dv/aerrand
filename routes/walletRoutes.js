// walletRoutes.js 
const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const authMiddleware = require('../middleware/auth'); 

// Protect all wallet routes
router.use(authMiddleware);

// Get the logged-in driver's wallet and earnings info
router.get('/', walletController.getEarnings);

// Receive a tip for a specific driver 
router.post('/tip/:driverId', walletController.receiveTip);

module.exports = router;


