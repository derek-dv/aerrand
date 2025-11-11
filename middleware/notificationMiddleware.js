// middleware/notificationMiddleware.js
const { NotificationService } = require('../services/NotificationService');

// Middleware for automatic notifications
const notificationMiddleware = (eventType) => {
  return async (req, res, next) => {
    // Store original res.json
    const originalJson = res.json;
    
    res.json = function(data) {
      // If response is successful, trigger notification
      if (data.success && eventType) {
        setImmediate(async () => {
          try {
            const userId = req.user?._id || req.user?.id;
            if (!userId) return;

            switch (eventType) {
              case 'profile_updated':
                await NotificationService.notifyProfileUpdated(userId);
                break;
              case 'document_uploaded':
                if (req.params?.documentType) {
                  await NotificationService.notifyDocumentUploaded(userId, req.params.documentType);
                }
                break;
              case 'registration_completed':
                await NotificationService.notifyRegistrationCompleted(userId);
                break;
              case 'verification_approved':
                await NotificationService.notifyVerificationApproved(userId);
                break;
              case 'verification_rejected':
                const reason = data.reason || req.body?.reason || 'Please check your documents';
                await NotificationService.notifyVerificationRejected(userId, reason);
                break;
              case 'payment_success':
                const amount = data.amount || req.body?.amount;
                if (amount) {
                  await NotificationService.notifyPaymentSuccess(userId, amount);
                }
                break;
              case 'payment_failed':
                await NotificationService.notifyPaymentFailed(userId);
                break;
            }
          } catch (error) {
            console.error('Notification middleware error:', error);
          }
        });
      }
      
      // Call original json method
      return originalJson.call(this, data);
    };
    
    next();
  };
};

module.exports = { notificationMiddleware };