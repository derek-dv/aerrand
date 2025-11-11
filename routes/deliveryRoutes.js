const express = require('express');
const router = express.Router();
const deliveryController = require('../controllers/deliveryController');
const authMiddleware = require('../middleware/auth'); 

// Test route (for debugging)
router.get('/test-schema', deliveryController.testDeliveryQuery);

// Get all available delivery jobs for drivers
router.get('/available', authMiddleware, deliveryController.getAvailableDeliveries);

// Get active delivery for a driver (this was missing!)
router.get('/active', authMiddleware, deliveryController.getActiveDelivery);

// Accept a delivery job
router.post('/:deliveryId/accept', authMiddleware, deliveryController.acceptDelivery);

// Start a delivery
router.post('/:deliveryId/start', authMiddleware, deliveryController.startDelivery);

// Complete a delivery
router.post('/:deliveryId/complete', authMiddleware, deliveryController.completeDelivery);

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { body, validationResult } = require('express-validator');
require('dotenv').config();

const Driver = require('../models/Driver');
const Otp = require('../models/Otp');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// Verify Cloudinary configuration
console.log('Cloudinary Configuration Check:');
console.log('Cloud Name:', cloudinary.config().cloud_name ? '✓ Set' : '✗ Missing');
console.log('API Key:', cloudinary.config().api_key ? '✓ Set' : '✗ Missing');
console.log('API Secret:', cloudinary.config().api_secret ? '✓ Set' : '✗ Missing');

const testCloudinaryConnection = async () => {
  try {
    const result = await cloudinary.api.ping();
    console.log('Cloudinary connection test:', result.status === 'ok' ? '✓ Success' : '✗ Failed');
  } catch (error) {
    console.error('Cloudinary connection test failed:', error.message);
    console.log('Please check your Cloudinary environment variables:');
    console.log('- CLOUDINARY_CLOUD_NAME');
    console.log('- CLOUDINARY_API_KEY'); 
    console.log('- CLOUDINARY_API_SECRET');
  }
};

// Run the test
testCloudinaryConnection();

// Fixed Cloudinary storage configuration
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'driver-documents',
    allowed_formats: ['jpg', 'jpeg', 'png', 'pdf'],
    transformation: [
      { width: 1200, height: 1200, crop: 'limit', quality: 'auto' },
      { format: 'auto' }
    ],
    public_id: (req, file) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      
      // Safe extraction of phone number
      let phone = 'unknown';
      try {
        // Use user info attached in preprocessing middleware
        if (req.user && req.user.phone) {
          phone = req.user.phone.replace(/[^a-zA-Z0-9]/g, '');
        } else {
          // Fallback: try to extract from token
          const token = req.header('Authorization')?.split(" ")[1];
          if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            phone = (decoded.phone || decoded.id || 'user').toString().replace(/[^a-zA-Z0-9]/g, '');
          }
        }
      } catch (error) {
        console.error('Error extracting phone for public_id:', error);
        phone = 'user';
      }
      
      return `${file.fieldname}-${phone}-${uniqueSuffix}`;
    }
  },
});

const fileFilter = (req, file, cb) => {
  // Accept images and PDFs
  if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    const error = new Error('Only image files and PDFs are allowed');
    error.code = 'INVALID_FILE_TYPE';
    cb(error, false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1 // Single file upload
  }
});

// Enhanced handleMulterError middleware with more specific error handling
const handleMulterError = (err, req, res, next) => {
  console.error('Multer error occurred:', err);
  console.error('Error code:', err.code);
  console.error('Error message:', err.message);

  if (err instanceof multer.MulterError) {
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({ 
          success: false,
          error: 'File too large',
          message: 'File size exceeds the 10MB limit',
          maxSize: '10MB'
        });
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({ 
          success: false,
          error: 'Unexpected field',
          message: 'Unexpected file field',
          expectedField: 'document'
        });
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({ 
          success: false,
          error: 'Too many files',
          message: 'Only one file allowed per upload'
        });
      default:
        return res.status(400).json({ 
          success: false,
          error: 'Upload error',
          message: err.message,
          code: err.code
        });
    }
  }
  
  if (err.code === 'INVALID_FILE_TYPE') {
    return res.status(400).json({ 
      success: false,
      error: 'Invalid file type',
      message: err.message,
      allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']
    });
  }

  // Cloudinary specific errors
  if (err.message && err.message.includes('cloudinary')) {
    return res.status(500).json({ 
      success: false,
      error: 'Cloud storage error',
      message: 'Failed to upload file to cloud storage'
    });
  }

  // Database connection errors
  if (err.name === 'MongoError' || err.name === 'MongooseError') {
    return res.status(500).json({ 
      success: false,
      error: 'Database error',
      message: 'Failed to save document information'
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ 
      success: false,
      error: 'Authentication error',
      message: 'Invalid or expired token'
    });
  }

  // Generic server error with more details in development
  return res.status(500).json({ 
    success: false,
    error: 'Server error',
    message: 'An unexpected error occurred',
    ...(process.env.NODE_ENV === 'development' && { 
      details: err.message,
      type: err.constructor.name
    })
  });
};

// Use default OTP instead of random generation
const generateOTP = () => "123456"; // Default OTP for testing

// Helper function to get current registration step dynamically
const getCurrentRegistrationStep = (driver, tokenStep) => {
  // Always use the most advanced step between driver record and token
  const stepOrder = [
    'verified_phone',
    'basic_info_completed', 
    'earn_type_completed',
    'documents_uploading',
    'completed'
  ];
  
  const driverStepIndex = driver.registrationStep ? stepOrder.indexOf(driver.registrationStep) : -1;
  const tokenStepIndex = tokenStep ? stepOrder.indexOf(tokenStep) : -1;
  
  // Use the higher index (more advanced step)
  const currentIndex = Math.max(driverStepIndex, tokenStepIndex);
  return currentIndex >= 0 ? stepOrder[currentIndex] : 'verified_phone';
};

// Helper function to determine what the driver can do next
const getNextAllowedActions = (driver, currentStep) => {
  const actions = [];
  
  // Check what's missing and what can be done
  if (!driver.name || !driver.email) {
    actions.push('complete_basic_info');
  }
  
  if (!driver.earnType || !driver.city) {
    actions.push('setup_earn_type');
  }
  
  if (!driver.documents || Object.keys(driver.documents).length === 0) {
    actions.push('upload_documents');
  }
  
  const requiredDocs = ['driversLicense', 'profilePhoto'];
  const uploadedDocs = driver.documents ? Object.keys(driver.documents) : [];
  const missingDocs = requiredDocs.filter(doc => !uploadedDocs.includes(doc));
  
  if (missingDocs.length === 0 && driver.earnType && driver.city && driver.name) {
    actions.push('complete_registration');
  }
  
  return actions;
};

// Validation middleware
const earnTypeValidation = [
  body('earnType').isIn(['car', 'scooter', 'bicycle', 'truck']).withMessage('Invalid earn type'),
  body('city').notEmpty().withMessage('City is required'),
  body('referralCode').optional().isLength({ min: 3, max: 20 }).withMessage('Referral code must be between 3-20 characters')
];

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

// Upload drop-off photo
router.post('/:deliveryId/upload-dropoff-photo', 
  authMiddleware, 
  deliveryController.getUploadMiddleware(), 
  deliveryController.uploadDropOffPhoto
);

// Upload escrow photo
router.post('/:deliveryId/upload-escrow-photo', 
  authMiddleware, 
  deliveryController.getUploadMiddleware(), 
  deliveryController.uploadEscrowPhoto
);

// Get delivery photos (optional - for viewing uploaded photos)
router.get('/:deliveryId/photos', authMiddleware, deliveryController.getDeliveryPhotos);

// Delete delivery photo (optional - for removing photos)
router.delete('/:deliveryId/photos/:photoType', authMiddleware, deliveryController.deleteDeliveryPhoto);

// Get a driver's delivery history
router.get('/history', authMiddleware, deliveryController.getDriverDeliveryHistory);
router.get('/active/debug', authMiddleware, deliveryController.getActiveDeliveryDebug);
router.get('/:deliveryId/check-status', authMiddleware, deliveryController.checkAcceptanceStatus);
module.exports = router;