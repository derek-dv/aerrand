// services/NotificationService.js
const Notification = require('../models/Notification');

class NotificationService {
  
  // Generic notification creation
  static async createNotification(userId, type, title, message, data = {}, options = {}) {
    try {
      const notification = await Notification.create({
        userId,
        type,
        title,
        message,
        data,
        priority: options.priority || 'medium',
        actionButton: options.actionButton || null,
        expiresAt: options.expiresAt || null,
        groupId: options.groupId || null
      });

      console.log(`Notification created for user ${userId}: ${type}`);
      return notification;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  }

  // DELIVERY NOTIFICATIONS
  static async notifyDeliveryAvailable(driverId, delivery) {
    return this.createNotification(
      driverId,
      'delivery_available',
      'New Delivery Available',
      `A delivery from ${delivery.pickupAddress} to ${delivery.dropoffAddress} is available.`,
      {
        deliveryId: delivery._id,
        pickupAddress: delivery.pickupAddress,
        dropoffAddress: delivery.dropoffAddress,
        estimatedEarning: delivery.price,
        distance: delivery.distance
      },
      {
        priority: 'high',
        actionButton: {
          text: 'View Details',
          action: 'view_delivery',
          data: { deliveryId: delivery._id }
        }
      }
    );
  }

  static async notifyDeliveryAccepted(driverId, delivery) {
    return this.createNotification(
      driverId,
      'delivery_accepted',
      'Delivery Accepted',
      `You've accepted a delivery to ${delivery.dropoffAddress}. Head to pickup location.`,
      {
        deliveryId: delivery._id,
        pickupAddress: delivery.pickupAddress,
        dropoffAddress: delivery.dropoffAddress
      },
      {
        priority: 'high',
        actionButton: {
          text: 'Start Delivery',
          action: 'start_delivery',
          data: { deliveryId: delivery._id }
        }
      }
    );
  }

  static async notifyDeliveryStarted(driverId, delivery) {
    return this.createNotification(
      driverId,
      'delivery_started',
      'Delivery In Progress',
      `You're now en route to ${delivery.dropoffAddress}. Drive safely!`,
      {
        deliveryId: delivery._id,
        dropoffAddress: delivery.dropoffAddress,
        estimatedTime: delivery.estimatedDeliveryTime
      },
      { priority: 'medium' }
    );
  }

  static async notifyDeliveryCompleted(driverId, delivery, earning) {
    return this.createNotification(
      driverId,
      'delivery_completed',
      'Delivery Completed! 🎉',
      `Great job! You earned $${earning} for this delivery.`,
      {
        deliveryId: delivery._id,
        earning: earning,
        dropoffAddress: delivery.dropoffAddress
      },
      {
        priority: 'high',
        actionButton: {
          text: 'View Earnings',
          action: 'view_earnings',
          data: { deliveryId: delivery._id }
        }
      }
    );
  }

  static async notifyDeliveryCancelled(driverId, delivery, reason) {
    return this.createNotification(
      driverId,
      'delivery_cancelled',
      'Delivery Cancelled',
      `The delivery has been cancelled. Reason: ${reason}`,
      {
        deliveryId: delivery._id,
        reason: reason,
        dropoffAddress: delivery.dropoffAddress
      },
      { priority: 'medium' }
    );
  }

  static async notifyPhotoRequired(driverId, delivery, photoType) {
    const photoTypeText = photoType === 'dropoff' ? 'drop-off' : 'pickup';
    return this.createNotification(
      driverId,
      'delivery_photo_required',
      `${photoTypeText.charAt(0).toUpperCase() + photoTypeText.slice(1)} Photo Required`,
      `Please upload a ${photoTypeText} photo to complete this step.`,
      {
        deliveryId: delivery._id,
        photoType: photoType
      },
      {
        priority: 'high',
        actionButton: {
          text: 'Upload Photo',
          action: 'upload_photo',
          data: { deliveryId: delivery._id, photoType: photoType }
        }
      }
    );
  }

  // REGISTRATION NOTIFICATIONS
  static async notifyRegistrationCompleted(driverId) {
    return this.createNotification(
      driverId,
      'registration_completed',
      'Registration Complete! 🎉',
      'Welcome to Errand! Your driver registration is now complete and under review.',
      { registrationStep: 'completed' },
      {
        priority: 'high',
        actionButton: {
          text: 'Start Driving',
          action: 'view_available_deliveries',
          data: {}
        }
      }
    );
  }

  static async notifyProfileUpdated(driverId, updatedFields = []) {
    const fieldsText = updatedFields.length > 0 ? updatedFields.join(', ') : 'profile information';
    return this.createNotification(
      driverId,
      'profile_updated',
      'Profile Updated',
      `Your ${fieldsText} has been updated successfully.`,
      { updatedFields: updatedFields },
      { priority: 'low' }
    );
  }

  static async notifyDocumentUploaded(driverId, documentType) {
    const docTypeText = documentType.replace(/([A-Z])/g, ' $1').trim();
    return this.createNotification(
      driverId,
      'document_uploaded',
      'Document Uploaded',
      `Your ${docTypeText} has been uploaded successfully and is under review.`,
      { documentType: documentType },
      { priority: 'medium' }
    );
  }

  static async notifyDocumentVerified(driverId, documentType) {
    const docTypeText = documentType.replace(/([A-Z])/g, ' $1').trim();
    return this.createNotification(
      driverId,
      'document_verified',
      'Document Verified ✅',
      `Your ${docTypeText} has been verified and approved.`,
      { documentType: documentType },
      { priority: 'medium' }
    );
  }

  static async notifyVerificationPending(driverId) {
    return this.createNotification(
      driverId,
      'verification_pending',
      'Verification Under Review',
      'Your documents are being reviewed. This usually takes 24-48 hours.',
      {},
      { priority: 'medium' }
    );
  }

  static async notifyVerificationApproved(driverId) {
    return this.createNotification(
      driverId,
      'verification_approved',
      'Account Verified! 🎉',
      'Congratulations! Your driver account has been verified. You can now start accepting deliveries.',
      {},
      {
        priority: 'high',
        actionButton: {
          text: 'Start Driving',
          action: 'view_available_deliveries',
          data: {}
        }
      }
    );
  }

  static async notifyVerificationRejected(driverId, reason) {
    return this.createNotification(
      driverId,
      'verification_rejected',
      'Verification Issues',
      `Your account verification needs attention. ${reason}`,
      { rejectionReason: reason },
      {
        priority: 'high',
        actionButton: {
          text: 'Fix Issues',
          action: 'update_documents',
          data: {}
        }
      }
    );
  }

  // PAYMENT NOTIFICATIONS
  static async notifyPaymentSuccess(driverId, amount, description = '') {
    return this.createNotification(
      driverId,
      'payment_success',
      'Payment Received 💰',
      `You've received $${amount}${description ? ` for ${description}` : ''}.`,
      { amount: amount, description: description },
      {
        priority: 'high',
        actionButton: {
          text: 'View Earnings',
          action: 'view_earnings',
          data: {}
        }
      }
    );
  }

  static async notifyPaymentFailed(driverId, reason = '') {
    return this.createNotification(
      driverId,
      'payment_failed',
      'Payment Issue',
      `There was an issue processing your payment${reason ? `: ${reason}` : ''}. Please check your payment details.`,
      { failureReason: reason },
      {
        priority: 'high',
        actionButton: {
          text: 'Update Payment Info',
          action: 'update_payment',
          data: {}
        }
      }
    );
  }

  // ACCOUNT NOTIFICATIONS
  static async notifyAccountSuspended(driverId, reason) {
    return this.createNotification(
      driverId,
      'account_suspended',
      'Account Suspended',
      `Your account has been temporarily suspended. Reason: ${reason}`,
      { suspensionReason: reason },
      {
        priority: 'high',
        actionButton: {
          text: 'Contact Support',
          action: 'contact_support',
          data: {}
        }
      }
    );
  }

  static async notifyAccountReactivated(driverId) {
    return this.createNotification(
      driverId,
      'account_reactivated',
      'Account Reactivated 🎉',
      'Your account has been reactivated. You can now resume taking deliveries.',
      {},
      {
        priority: 'high',
        actionButton: {
          text: 'Start Driving',
          action: 'view_available_deliveries',
          data: {}
        }
      }
    );
  }

  // SYSTEM NOTIFICATIONS
  static async notifyNewFeature(driverId, featureName, description) {
    return this.createNotification(
      driverId,
      'new_feature',
      `New Feature: ${featureName}`,
      description,
      { featureName: featureName },
      { priority: 'low' }
    );
  }

  static async notifyMaintenanceNotice(driverId, startTime, endTime, description) {
    return this.createNotification(
      driverId,
      'maintenance_notice',
      'Scheduled Maintenance',
      `The app will be under maintenance from ${startTime} to ${endTime}. ${description}`,
      {
        startTime: startTime,
        endTime: endTime,
        description: description
      },
      { priority: 'medium' }
    );
  }

  // MESSAGING NOTIFICATIONS
  static async notifyNewMessage(driverId, senderId, senderName, messagePreview) {
    return this.createNotification(
      driverId,
      'new_message',
      `New message from ${senderName}`,
      messagePreview,
      {
        senderId: senderId,
        senderName: senderName
      },
      {
        priority: 'medium',
        actionButton: {
          text: 'Reply',
          action: 'open_chat',
          data: { senderId: senderId }
        }
      }
    );
  }

  static async notifyConversationStarted(driverId, senderId, senderName) {
    return this.createNotification(
      driverId,
      'conversation_started',
      'New Conversation',
      `${senderName} started a conversation with you.`,
      {
        senderId: senderId,
        senderName: senderName
      },
      {
        priority: 'medium',
        actionButton: {
          text: 'View Chat',
          action: 'open_chat',
          data: { senderId: senderId }
        }
      }
    );
  }

  // BULK NOTIFICATIONS
  static async notifyMultipleUsers(userIds, type, title, message, data = {}, options = {}) {
    try {
      const notifications = userIds.map(userId => ({
        userId,
        type,
        title,
        message,
        data,
        priority: options.priority || 'medium',
        actionButton: options.actionButton || null,
        expiresAt: options.expiresAt || null,
        groupId: options.groupId || null
      }));

      const result = await Notification.insertMany(notifications);
      console.log(`Bulk notification sent to ${userIds.length} users: ${type}`);
      return result;
    } catch (error) {
      console.error('Error sending bulk notifications:', error);
      throw error;
    }
  }

  // UTILITY METHODS
  static async markAsRead(userId, notificationIds = null) {
    try {
      const result = await Notification.markAsRead(userId, notificationIds);
      console.log(`Marked ${result.modifiedCount} notifications as read for user ${userId}`);
      return result;
    } catch (error) {
      console.error('Error marking notifications as read:', error);
      throw error;
    }
  }

  static async deleteNotifications(userId, notificationIds) {
    try {
      const result = await Notification.deleteMany({
        _id: { $in: notificationIds },
        userId: userId
      });
      console.log(`Deleted ${result.deletedCount} notifications for user ${userId}`);
      return result;
    } catch (error) {
      console.error('Error deleting notifications:', error);
      throw error;
    }
  }

  static async getUnreadCount(userId) {
    try {
      return await Notification.getUnreadCount(userId);
    } catch (error) {
      console.error('Error getting unread count:', error);
      throw error;
    }
  }

  static async cleanupExpiredNotifications() {
    try {
      const result = await Notification.deleteMany({
        expiresAt: { $lt: new Date() }
      });
      console.log(`Cleaned up ${result.deletedCount} expired notifications`);
      return result;
    } catch (error) {
      console.error('Error cleaning up expired notifications:', error);
      throw error;
    }
  }
}

module.exports = { NotificationService };