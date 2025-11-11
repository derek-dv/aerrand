// models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  firstName: {
    type: String,
    required: true
  },
  lastName: {
    type: String,
    required: true
  },
  email: { 
    type: String, 
    required: true,
    unique: true 
  },
  phone: {
    type: String,
    required: true
  },
  password: {
    type: String,
    required: true
  },
  verified: { 
    type: Boolean, 
    default: false 
  },
  
  // Location for delivery purposes
  defaultLocation: {
    address: String,
    lat: Number,
    lng: Number
  },
  
  // User statistics
  totalDeliveries: {
    type: Number,
    default: 0
  },
  
  rating: {
    type: Number,
    default: 5.0
  }
}, { 
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.password;
      return ret;
    }
  }
});

// Create indexes for better performance
UserSchema.index({ email: 1 });
UserSchema.index({ phone: 1 });

module.exports = mongoose.model('User', UserSchema);