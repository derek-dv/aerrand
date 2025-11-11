// models/Notification.js
const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: [
      // Delivery notifications
      'delivery_available',
      'delivery_accepted',
      'delivery_started',
      'delivery_completed',
      'delivery_cancelled',
      'delivery_photo_required',
      
      // Driver registration notifications
      'registration_completed',
      'profile_updated',
      'document_uploaded',
      'document_verified',
      'verification_pending',
      'verification_approved',
      'verification_rejected',
      
      // System notifications
      'payment_success',
      'payment_failed',
      'account_suspended',
      'account_reactivated',
      'new_feature',
      'maintenance_notice',
      
      // Chat notifications
      'new_message',
      'conversation_started',
      
      // General
      'general'
    ]
  },
  title: {
    type: String,
    required: true,
    maxlength: 100
  },
  message: {
    type: String,
    required: true,
    maxlength: 500
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  isRead: {
    type: Boolean,
    default: false,
    index: true
  },
  readAt: {
    type: Date
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  actionButton: {
    text: String,
    action: String,
    data: mongoose.Schema.Types.Mixed
  },
  expiresAt: {
    type: Date
  },
  deliveryStatus: {
    type: String,
    enum: ['pending', 'sent', 'failed'],
    default: 'pending'
  },
  groupId: String // For grouping related notifications
}, {
  timestamps: true
});

// Indexes for performance
NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, isRead: 1 });
NotificationSchema.index({ type: 1 });
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Static methods
NotificationSchema.statics.getUserNotifications = async function(userId, options = {}) {
  const {
    page = 1,
    limit = 20,
    type,
    isRead,
    priority
  } = options;

  const query = { userId };
  
  if (type) query.type = type;
  if (isRead !== null && isRead !== undefined) query.isRead = isRead;
  if (priority) query.priority = priority;

  const skip = (page - 1) * limit;

  const [notifications, total] = await Promise.all([
    this.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    this.countDocuments(query)
  ]);

  return {
    notifications,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1
    }
  };
};

NotificationSchema.statics.getUnreadCount = async function(userId) {
  return this.countDocuments({ userId, isRead: false });
};

NotificationSchema.statics.markAsRead = async function(userId, notificationIds = null) {
  const query = { userId, isRead: false };
  
  if (notificationIds && notificationIds.length > 0) {
    query._id = { $in: notificationIds };
  }

  return this.updateMany(query, {
    isRead: true,
    readAt: new Date()
  });
};

NotificationSchema.statics.createNotification = async function(data) {
  const notification = new this(data);
  await notification.save();
  return notification;
};

// Instance methods
NotificationSchema.methods.toAPIResponse = function() {
  return {
    id: this._id,
    type: this.type,
    title: this.title,
    message: this.message,
    data: this.data,
    isRead: this.isRead,
    readAt: this.readAt,
    priority: this.priority,
    actionButton: this.actionButton,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

module.exports = mongoose.model('Notification', NotificationSchema);