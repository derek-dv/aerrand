// routeRoutes.js 
const express = require('express');
const router = express.Router();
const routeController = require('../controllers/routeController');
const authMiddleware = require('../middleware/auth'); 

// Protect all route routes with authentication
router.use(authMiddleware);

// Get all routes assigned to the logged-in driver
router.get('/', routeController.getAssignedRoutes);

// Get summary/details for a specific route by ID
router.get('/:routeId', routeController.getRouteSummary);

// Update the status of a specific stop in a route
router.patch('/:routeId/stop-status', routeController.updateStopStatus);

module.exports = router;
