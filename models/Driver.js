const mongoose = require('mongoose');

const DriverSchema = new mongoose.Schema({
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
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  
  // New fields for earn type registration
  earnType: {
    type: String,
    enum: ['car', 'scooter', 'bicycle', 'truck'],
    default: null
  },
  city: {
    type: String,
    default: null
  },
  referralCode: {
    type: String,
    default: null
  },
  registrationStep: {
    type: String,
    enum: ['verified_phone', 'basic_info_completed', 'earn_type_completed', 'documents_uploading', 'completed'],
    default: 'verified_phone'
  },
  
  // Document storage
  documents: {
    driversLicense: {
      filename: String,
      originalName: String,
      mimetype: String,
      size: Number,
      url: String,
      publicId: String,
      uploadedAt: Date
    },
    profilePhoto: {
      filename: String,
      originalName: String,
      mimetype: String,
      size: Number,
      url: String,
      publicId: String,
      uploadedAt: Date
    },
    socialInsuranceNumber: {
      filename: String,
      originalName: String,
      mimetype: String,
      size: Number,
      url: String,
      publicId: String,
      uploadedAt: Date
    },
    vehicleRegistration: {
      filename: String,
      originalName: String,
      mimetype: String,
      size: Number,
      url: String,
      publicId: String,
      uploadedAt: Date
    },
    vehicleInsurance: {
      filename: String,
      originalName: String,
      mimetype: String,
      size: Number,
      url: String,
      publicId: String,
      uploadedAt: Date
    }
  },
  
  // Existing fields
  licenseUrl: {
    type: String,
    default: null
  },
  verified: { 
    type: Boolean, 
    default: false 
  },
  available: { 
    type: Boolean, 
    default: false 
  },
  location: {
    type: { 
      type: String, 
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      default: [0, 0]
    }
  },
  rating: {
    type: Number,
    default: 0
  },
  totalDeliveries: {
    type: Number,
    default: 0
  },
  
  // Background check consent
  backgroundCheckConsent: {
    type: Boolean,
    default: false
  },
  backgroundCheckStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'not_started'],
    default: 'not_started'
  },
  
  // Community safety education completion
  safetyEducationCompleted: {
    type: Boolean,
    default: false
  },
  safetyEducationCompletedAt: {
    type: Date,
    default: null
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

// Create geospatial index
DriverSchema.index({ location: '2dsphere' });

// Method to check if registration is complete
DriverSchema.methods.isRegistrationComplete = function() {
  const requiredFields = ['firstName', 'lastName', 'email', 'phone', 'earnType', 'city'];
  const requiredDocs = ['driversLicense', 'profilePhoto'];
  
  // Check required fields
  for (let field of requiredFields) {
    if (!this[field]) return false;
  }
  
  // Check required documents
  if (!this.documents) return false;
  for (let doc of requiredDocs) {
    if (!this.documents[doc] || !this.documents[doc].url) return false;
  }
  
  return true;
};

// Method to get registration progress percentage
DriverSchema.methods.getRegistrationProgress = function() {
  let progress = 0;
  const totalSteps = 5;
  
  // Step 1: Phone verified (20%)
  if (this.registrationStep !== 'verified_phone') progress += 20;
  
  // Step 2: Basic info completed (20%)
  if (this.firstName && this.lastName && this.email) progress += 20;
  
  // Step 3: Earn type setup (20%)
  if (this.earnType && this.city) progress += 20;
  
  // Step 4: Required documents uploaded (30%)
  const requiredDocs = ['driversLicense', 'profilePhoto'];
  const uploadedDocs = this.documents ? Object.keys(this.documents) : [];
  const docProgress = requiredDocs.filter(doc => uploadedDocs.includes(doc)).length;
  progress += (docProgress / requiredDocs.length) * 30;
  
  // Step 5: Verification complete (10%)
  if (this.verified) progress += 10;
  
  return Math.round(progress);
};

module.exports = mongoose.model('Driver', DriverSchema);