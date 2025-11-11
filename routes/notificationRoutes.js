// routes/notificationRoutes.js
const express = require('express');
const { body, query } = require('express-validator');
const authMiddleware = require('../middleware/auth');
const notificationController = require('../controllers/notificationController');

const router = express.Router();

// Helper function to handle validation errors (if not in middleware folder)
const handleValidationErrorsInline = (req, res, next) => {
  const { validationResult } = require('express-validator');
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// GET /api/notifications - Get user notifications with pagination and filtering
router.get('/',
  authMiddleware,
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    
    query('type')
      .optional()
      .isIn([
        'delivery_available', 'delivery_accepted', 'delivery_started', 'delivery_completed',
        'delivery_cancelled', 'delivery_photo_required', 'registration_completed',
        'profile_updated', 'document_uploaded', 'document_verified', 'verification_pending',
        'verification_approved', 'verification_rejected', 'payment_success', 'payment_failed',
        'account_suspended', 'account_reactivated', 'new_feature', 'maintenance_notice',
        'new_message', 'conversation_started', 'general'
      ])
      .withMessage('Invalid notification type'),
    
    query('isRead')
      .optional()
      .isBoolean()
      .withMessage('isRead must be boolean'),
    
    query('priority')
      .optional()
      .isIn(['low', 'medium', 'high'])
      .withMessage('Priority must be low, medium, or high')
  ],
  handleValidationErrorsInline,
  notificationController.getNotifications
);

// GET /api/notifications/unread-count - Get unread notification count
router.get('/unread-count',
  authMiddleware,
  notificationController.getUnreadCount
);

// GET /api/notifications/stats - Get notification statistics
router.get('/stats',
  authMiddleware,
  notificationController.getNotificationStats
);

// GET /api/notifications/:id - Get specific notification
router.get('/:id',
  authMiddleware,
  notificationController.getNotification
);

// PATCH /api/notifications/:id/read - Mark specific notification as read
router.patch('/:id/read',
  authMiddleware,
  notificationController.markAsRead
);

// PUT /api/notifications/mark-read - Mark multiple notifications as read
router.put('/mark-read',
  authMiddleware,
  [
    body('notificationIds')
      .optional()
      .isArray()
      .withMessage('Notification IDs must be an array'),
    
    body('notificationIds.*')
      .optional()
      .isMongoId()
      .withMessage('Each notification ID must be a valid MongoDB ObjectId'),
    
    body('markAll')
      .optional()
      .isBoolean()
      .withMessage('markAll must be boolean')
  ],
  handleValidationErrorsInline,
  notificationController.markMultipleAsRead
);

// DELETE /api/notifications/:id - Delete specific notification
router.delete('/:id',
  authMiddleware,
  notificationController.deleteNotification
);

// DELETE /api/notifications - Delete multiple notifications
router.delete('/',
  authMiddleware,
  [
    body('notificationIds')
      .isArray({ min: 1 })
      .withMessage('Notification IDs must be a non-empty array'),
    
    body('notificationIds.*')
      .isMongoId()
      .withMessage('Each notification ID must be a valid MongoDB ObjectId')
  ],
  handleValidationErrorsInline,
  notificationController.deleteMultipleNotifications
);

// POST /api/notifications/test - Test notification creation (development only)
router.post('/test',
  authMiddleware,
  [
    body('type')
      .isIn([
        'delivery_available', 'delivery_accepted', 'delivery_started', 'delivery_completed',
        'delivery_cancelled', 'delivery_photo_required', 'registration_completed',
        'profile_updated', 'document_uploaded', 'document_verified', 'verification_pending',
        'verification_approved', 'verification_rejected', 'payment_success', 'payment_failed',
        'account_suspended', 'account_reactivated', 'new_feature', 'maintenance_notice',
        'new_message', 'conversation_started', 'general'
      ])
      .withMessage('Invalid notification type'),
    
    body('title')
      .isLength({ min: 1, max: 100 })
      .withMessage('Title must be between 1 and 100 characters'),
    
    body('message')
      .isLength({ min: 1, max: 500 })
      .withMessage('Message must be between 1 and 500 characters'),
    
    body('data')
      .optional()
      .isObject()
      .withMessage('Data must be an object'),
    
    body('priority')
      .optional()
      .isIn(['low', 'medium', 'high'])
      .withMessage('Priority must be low, medium, or high')
  ],
  handleValidationErrorsInline,
  notificationController.createTestNotification
);

module.exports = router;