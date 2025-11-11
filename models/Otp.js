const mongoose = require('mongoose');

const OtpSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true
  },
  code: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['driver_registration', 'user_registration', 'password_reset'],
    default: 'driver_registration'
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 } // MongoDB will automatically delete expired documents
  }
}, { timestamps: true });

// Create compound index for efficient queries
OtpSchema.index({ phone: 1, code: 1, type: 1 });

module.exports = mongoose.model('Otp', OtpSchema);