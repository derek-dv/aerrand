// controllers/notificationController.js
const { validationResult } = require('express-validator');
const Notification = require('../models/Notification');
const { NotificationService } = require('../services/NotificationService');

// Helper function to handle validation errors
const handleValidationErrors = (req, res, next) => {
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

const notificationController = {
  // GET /api/notifications - Get user notifications with pagination and filtering
  getNotifications: async (req, res) => {
    try {
      const {
        page = 1,
        limit = 20,
        type,
        isRead,
        priority
      } = req.query;

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        type,
        isRead: isRead !== undefined ? isRead === 'true' : null,
        priority
      };

      const result = await Notification.getUserNotifications(req.user._id, options);

      res.json({
        success: true,
        data: {
          notifications: result.notifications.map(notification => ({
            id: notification._id,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            data: notification.data,
            isRead: notification.isRead,
            readAt: notification.readAt,
            priority: notification.priority,
            actionButton: notification.actionButton,
            createdAt: notification.createdAt,
            updatedAt: notification.updatedAt
          })),
          pagination: result.pagination
        }
      });
    } catch (error) {
      console.error('Get notifications error:', error);
      res.status(500).json({
        success: false,
        error: 'Server error',
        message: 'Failed to fetch notifications. Please try again.'
      });
    }
  },

  // GET /api/notifications/unread-count - Get unread notification count
  getUnreadCount: async (req, res) => {
    try {
      const count = await Notification.getUnreadCount(req.user._id);
      
      res.json({
        success: true,
        data: { count }
      });
    } catch (error) {
      console.error('Get unread count error:', error);
      res.status(500).json({
        success: false,
        error: 'Server error',
        message: 'Failed to fetch unread count. Please try again.'
      });
    }
  },

  // PATCH /api/notifications/:id/read - Mark specific notification as read
  markAsRead: async (req, res) => {
    try {
      const { id } = req.params;

      const notification = await Notification.findOneAndUpdate(
        {
          _id: id,
          userId: req.user._id
        },
        {
          isRead: true,
          readAt: new Date()
        },
        { new: true }
      );

      if (!notification) {
        return res.status(404).json({
          success: false,
          error: 'Notification not found',
          message: 'The requested notification could not be found.'
        });
      }

      res.json({
        success: true,
        message: 'Notification marked as read',
        data: { notification: notification.toAPIResponse() }
      });
    } catch (error) {
      console.error('Mark notification as read error:', error);
      res.status(500).json({
        success: false,
        error: 'Server error',
        message: 'Failed to mark notification as read. Please try again.'
      });
    }
  },

  // PUT /api/notifications/mark-read - Mark multiple notifications as read
  markMultipleAsRead: async (req, res) => {
    try {
      const { notificationIds, markAll } = req.body;

      let result;
      if (markAll) {
        // Mark all notifications as read
        result = await Notification.markAsRead(req.user._id);
      } else if (notificationIds && notificationIds.length > 0) {
        // Mark specific notifications as read
        result = await Notification.markAsRead(req.user._id, notificationIds);
      } else {
        return res.status(400).json({
          success: false,
          error: 'Invalid request',
          message: 'Either provide notification IDs or set markAll to true'
        });
      }

      console.log(`Marked ${result.modifiedCount} notifications as read for user: ${req.user._id}`);

      res.json({
        success: true,
        message: 'Notifications marked as read',
        data: { updatedCount: result.modifiedCount }
      });
    } catch (error) {
      console.error('Mark notifications as read error:', error);
      res.status(500).json({
        success: false,
        error: 'Server error',
        message: 'Failed to mark notifications as read. Please try again.'
      });
    }
  },

  // GET /api/notifications/:id - Get specific notification
  getNotification: async (req, res) => {
    try {
      const notification = await Notification.findOne({
        _id: req.params.id,
        userId: req.user._id
      });

      if (!notification) {
        return res.status(404).json({
          success: false,
          error: 'Notification not found',
          message: 'The requested notification could not be found.'
        });
      }

      res.json({
        success: true,
        data: {
          notification: notification.toAPIResponse()
        }
      });
    } catch (error) {
      console.error('Get notification error:', error);
      res.status(500).json({
        success: false,
        error: 'Server error',
        message: 'Failed to fetch notification. Please try again.'
      });
    }
  },

  // DELETE /api/notifications/:id - Delete specific notification
  deleteNotification: async (req, res) => {
    try {
      const notification = await Notification.findOneAndDelete({
        _id: req.params.id,
        userId: req.user._id
      });

      if (!notification) {
        return res.status(404).json({
          success: false,
          error: 'Notification not found',
          message: 'The requested notification could not be found.'
        });
      }

      console.log(`Deleted notification ${req.params.id} for user: ${req.user._id}`);

      res.json({
        success: true,
        message: 'Notification deleted successfully'
      });
    } catch (error) {
      console.error('Delete notification error:', error);
      res.status(500).json({
        success: false,
        error: 'Server error',
        message: 'Failed to delete notification. Please try again.'
      });
    }
  },

  // DELETE /api/notifications - Delete multiple notifications
  deleteMultipleNotifications: async (req, res) => {
    try {
      const { notificationIds } = req.body;

      if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request',
          message: 'Notification IDs must be a non-empty array'
        });
      }

      const result = await Notification.deleteMany({
        _id: { $in: notificationIds },
        userId: req.user._id
      });

      console.log(`Deleted ${result.deletedCount} notifications for user: ${req.user._id}`);

      res.json({
        success: true,
        message: 'Notifications deleted successfully',
        data: { deletedCount: result.deletedCount }
      });
    } catch (error) {
      console.error('Delete notifications error:', error);
      res.status(500).json({
        success: false,
        error: 'Server error',
        message: 'Failed to delete notifications. Please try again.'
      });
    }
  },

  // GET /api/notifications/stats - Get notification statistics
  getNotificationStats: async (req, res) => {
    try {
      const userId = req.user._id;

      const [
        totalCount,
        unreadCount,
        typeDistribution,
        priorityDistribution
      ] = await Promise.all([
        Notification.countDocuments({ userId }),
        Notification.countDocuments({ userId, isRead: false }),
        Notification.aggregate([
          { $match: { userId } },
          { $group: { _id: '$type', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ]),
        Notification.aggregate([
          { $match: { userId } },
          { $group: { _id: '$priority', count: { $sum: 1 } } }
        ])
      ]);

      res.json({
        success: true,
        data: {
          totalCount,
          unreadCount,
          readCount: totalCount - unreadCount,
          typeDistribution,
          priorityDistribution
        }
      });
    } catch (error) {
      console.error('Get notification stats error:', error);
      res.status(500).json({
        success: false,
        error: 'Server error',
        message: 'Failed to fetch notification statistics. Please try again.'
      });
    }
  },

  // POST /api/notifications/test - Test notification creation (development only)
  createTestNotification: async (req, res) => {
    try {
      // Only allow in development environment
      if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Test notifications are not allowed in production'
        });
      }

      const { type, title, message, data = {}, priority = 'medium' } = req.body;

      if (!type || !title || !message) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields',
          message: 'Type, title, and message are required'
        });
      }

      const notification = await NotificationService.createNotification(
        req.user._id,
        type,
        title,
        message,
        data,
        { priority }
      );

      res.json({
        success: true,
        message: 'Test notification created successfully',
        data: { notification: notification.toAPIResponse() }
      });
    } catch (error) {
      console.error('Create test notification error:', error);
      res.status(500).json({
        success: false,
        error: 'Server error',
        message: 'Failed to create test notification. Please try again.'
      });
    }
  }
};

module.exports = notificationController;