// models/Delivery.js (Clean version - remove duplicates)
const mongoose = require('mongoose');

const deliverySchema = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SenderReceiver',
    required: true
  },
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver',
    required: false,
    default: null,
    // Custom setter to handle empty strings
    set: function(value) {
      // Convert empty strings to null
      if (value === '' || value === undefined) {
        return null;
      }
      return value;
    }
  },
  
  // Location fields matching your database structure
  pickupLocation: {
    address: {
      type: String,
      required: true
    },
    lat: {
      type: Number,
      required: true
    },
    lng: {
      type: Number,
      required: true
    }
  },
  
  dropoffLocation: {
    address: {
      type: String,
      required: true
    },
    lat: {
      type: Number,
      required: true
    },
    lng: {
      type: Number,
      required: true
    }
  },
  
  // Vehicle and pricing fields
  vehicleType: {
    type: String,
    enum: ['motorcycle', 'car', 'van', 'truck'],
    required: true
  },
  
  scheduledTime: {
    type: Date,
    required: true
  },
  
  price: {
    type: Number,
    required: true
  },
  
  totalCost: {
    type: Number,
    default: 0
  },
  
  // Status field with 'upcoming' added
  status: {
    type: String,
    enum: ['upcoming', 'pending', 'accepted', 'in-transit', 'completed', 'cancelled'],
    default: 'upcoming'
  },
  
  // Escrow information
  escrow: {
    active: {
      type: Boolean,
      default: false
    },
    status: {
      type: String,
      enum: ['pending_verification', 'verified', 'released', 'refunded'],
      default: 'pending_verification'
    },
    fee: {
      type: Number,
      default: 0
    }
  },
  
  // Receiver details
  receiverDetails: {
    name: {
      type: String,
      required: true
    },
    phoneNumber: {
      type: String,
      required: true
    },
    note: {
      type: String,
      default: ''
    }
  },
  
  // Timestamp fields
  acceptedAt: {
    type: Date
  },
  
  startedAt: {
    type: Date
  },
  
  completedAt: {
    type: Date
  },
  photos: {
    dropOff: {
      url: String,
      publicId: String,
      uploadedAt: Date,
      filename: String
    },
    escrow: {
      url: String,
      publicId: String,
      uploadedAt: Date,
      filename: String
    }
  },
  
}, {
  timestamps: true,
  // Add this to handle strict query mode
  strictQuery: false
});

// Pre-save middleware to handle driverId conversion
deliverySchema.pre('save', function(next) {
  if (this.driverId === '' || this.driverId === undefined) {
    this.driverId = null;
  }
  next();
});

// Method to check if delivery is available for drivers
deliverySchema.methods.isAvailable = function() {
  return this.status === 'upcoming' && (!this.driverId || this.driverId === null);
};

// Static method to find available deliveries
deliverySchema.statics.findAvailable = function() {
  return this.find({
    status: 'upcoming',
    $or: [
      { driverId: { $exists: false } },
      { driverId: null }
    ]
  }).sort({ createdAt: -1 });
};

// Indexes for better performance
deliverySchema.index({ status: 1 });
deliverySchema.index({ driverId: 1 });
deliverySchema.index({ senderId: 1 });
deliverySchema.index({ scheduledTime: 1 });

// Compound index for finding available deliveries efficiently
deliverySchema.index({ status: 1, driverId: 1 });

module.exports = mongoose.model('Delivery', deliverySchema);