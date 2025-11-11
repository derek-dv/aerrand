const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { body, validationResult } = require('express-validator');
require('dotenv').config();
const { NotificationService } = require('../services/NotificationService');

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

class DriverRegistrationController {
  // Step 1: Register with phone number and send OTP
  async registerPhone(req, res) {
    try {
      const { phone } = req.body;

      if (!phone) {
        return res.status(400).json({ message: "Phone number is required" });
      }

      // Check if phone already exists
      const existingDriver = await Driver.findOne({ phone });
      if (existingDriver) {
        return res.status(409).json({ message: "Phone number already registered" });
      }

      const otpCode = generateOTP();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // expires in 5 mins

      // Delete any existing OTP for this phone
      await Otp.deleteMany({ phone });

      // Create new OTP record
      await Otp.create({ 
        phone, 
        code: otpCode, 
        expiresAt,
        type: 'driver_registration'
      });

      // Instead of sending via Twilio, just log the OTP
      console.log(`OTP for ${phone}: ${otpCode}`);

      res.status(200).json({ 
        message: "OTP sent successfully",
        phone: phone,
        // For testing purposes, include OTP in response (remove in production)
        otp: otpCode
      });

    } catch (error) {
      console.error('Error in registerPhone:', error);
      res.status(500).json({ 
        message: "Failed to send OTP", 
        error: error.message 
      });
    }
  }

  // Step 2: Verify OTP
  async verifyOtp(req, res) {
    try {
      const { phone, code } = req.body;

      if (!phone || !code) {
        return res.status(400).json({ message: "Phone number and OTP code are required" });
      }

      const otpRecord = await Otp.findOne({ 
        phone, 
        code,
        type: 'driver_registration'
      });

      if (!otpRecord) {
        return res.status(400).json({ message: "Invalid OTP" });
      }

      if (otpRecord.expiresAt < new Date()) {
        return res.status(400).json({ message: "OTP expired" });
      }

      // Generate temporary JWT token for completing registration
      const tempToken = jwt.sign(
        { phone, step: 'verified_phone' }, 
        process.env.JWT_SECRET, 
        { expiresIn: "2h" } // Increased to 2 hours for more flexibility
      );

      // Delete used OTP
      await Otp.deleteMany({ phone, type: 'driver_registration' });

      res.json({ 
        message: "Phone verified successfully",
        tempToken,
        nextStep: "complete_profile"
      });

    } catch (error) {
      console.error('Error in verifyOtp:', error);
      res.status(500).json({ 
        message: "OTP verification failed", 
        error: error.message 
      });
    }
  }

  // Step 3: Complete basic registration with name and email - FLEXIBLE VERSION
  async completeRegistration(req, res) {
    try {
      const { firstName, lastName, email, password } = req.body;

      // Validate required fields
      if (!firstName || !lastName || !email || !password) {
        return res.status(400).json({ 
          message: "First name, last name, email, and password are required" 
        });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Invalid email format" });
      }

      // Validate password length
      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      // Get phone from temporary token
      const tempToken = req.header('Authorization')?.split(" ")[1];
      if (!tempToken) {
        return res.status(401).json({ message: "Temporary token required" });
      }

      let decoded;
      try {
        decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
        // REMOVED: Strict step validation - now flexible
      } catch (error) {
        return res.status(401).json({ message: "Invalid or expired temporary token" });
      }

      // Get phone from token or check if driver already exists
      let phone = decoded.phone;
      let existingDriver = null;

      if (decoded.id) {
        // Token has driver ID, find existing driver
        existingDriver = await Driver.findById(decoded.id);
        if (existingDriver) {
          phone = existingDriver.phone;
        }
      }

      if (!phone) {
        return res.status(400).json({ message: "Phone number not found in token" });
      }

      // Check if email already exists (but not for the current driver)
      const existingEmail = await Driver.findOne({ 
        email,
        ...(existingDriver && { _id: { $ne: existingDriver._id } })
      });
      if (existingEmail) {
        return res.status(409).json({ message: "Email already registered" });
      }

      let driver;

      if (existingDriver) {
        // Update existing driver
        driver = existingDriver;
        driver.name = `${firstName} ${lastName}`;
        driver.firstName = firstName;
        driver.lastName = lastName;
        driver.email = email;
        
        // Only hash and update password if it's different
        const isPasswordSame = await bcrypt.compare(password, driver.password || '');
        if (!isPasswordSame) {
          driver.password = await bcrypt.hash(password, 12);
        }
        
        driver.registrationStep = 'basic_info_completed';
        await driver.save();
      } else {
        // Create new driver
        const hashedPassword = await bcrypt.hash(password, 12);

        driver = await Driver.create({
          name: `${firstName} ${lastName}`,
          firstName,
          lastName,
          email,
          phone,
          password: hashedPassword,
          verified: false,
          registrationStep: 'basic_info_completed',
          location: {
            type: 'Point',
            coordinates: [0, 0]
          }
        });
      }

      // Generate updated temporary token for next step
      const nextStepToken = jwt.sign(
        { 
          id: driver._id,
          phone: driver.phone,
          email: driver.email,
          step: 'basic_info_completed'
        }, 
        process.env.JWT_SECRET, 
        { expiresIn: "2h" }
      );

      // Remove password from response
      const driverResponse = driver.toObject();
      delete driverResponse.password;
      try {
        await NotificationService.notifyProfileUpdated(driver._id, ['name', 'email']);
      } catch (notificationError) {
        console.error('Failed to send profile update notification:', notificationError);
      }
      res.status(existingDriver ? 200 : 201).json({
        message: "Basic registration completed successfully",
        tempToken: nextStepToken,
        driver: driverResponse,
        nextStep: "setup_earn_type",
        allowedActions: getNextAllowedActions(driver, 'basic_info_completed')
      });

    } catch (error) {
      console.error('Error in completeRegistration:', error);
      res.status(500).json({ 
        message: "Registration failed", 
        error: error.message 
      });
    }
  }


  async googleLogin(req, res) {
    try {
      const { idToken } = req.body;
      if (!idToken) {
        return res.status(400).json({ message: "Google ID token required" });
      }

      // 1️⃣ Verify the Google token
      const ticket = await client.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();

      const { email, given_name, family_name, picture, sub: googleId } = payload;

      // 2️⃣ Check if a driver with this email already exists
      let driver = await Driver.findOne({ email });

      if (!driver) {
        // 🆕 Create a new driver entry
        driver = await Driver.create({
          name: `${given_name} ${family_name}`,
          firstName: given_name,
          lastName: family_name,
          email,
          googleId,
          password: null, // no password since using Google
          verified: true,
          registrationStep: 'basic_info_completed',
          profilePhoto: picture,
          location: {
            type: 'Point',
            coordinates: [0, 0],
          },
        });
      }

      // 3️⃣ Generate token
      const token = jwt.sign(
        {
          id: driver._id,
          email: driver.email,
          phone: driver.phone || null,
          type: 'driver',
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      // 4️⃣ Remove sensitive fields
      const driverResponse = driver.toObject();
      delete driverResponse.password;

      // 5️⃣ Notify or log event (optional)
      try {
        await NotificationService.notifyProfileUpdated(driver._id, ['googleLogin']);
      } catch (err) {
        console.error("Notification failed:", err);
      }

      // 6️⃣ Respond similar to `completeRegistration`
      res.status(driver.isNew ? 201 : 200).json({
        success: true,
        message: driver.isNew
          ? "Google registration completed successfully"
          : "Logged in successfully with Google",
        token,
        driver: driverResponse,
        nextStep: driver.isNew ? "setup_earn_type" : "dashboard",
        allowedActions: getNextAllowedActions(driver, 'basic_info_completed'),
      });

    } catch (error) {
      console.error("Google login error:", error);
      res.status(500).json({
        success: false,
        message: "Google login failed",
        error: error.message,
      });
    }
  }

  // Step 4: Setup earn type and location - FLEXIBLE VERSION
  async setupEarnType(req, res) {
    try {
      const { earnType, city, referralCode } = req.body;

      // Validate inputs
      if (!earnType || !city) {
        return res.status(400).json({
          success: false,
          message: "Earn type and city are required"
        });
      }

      // Validate earn type
      const validEarnTypes = ['car', 'scooter', 'bicycle', 'truck'];
      if (!validEarnTypes.includes(earnType)) {
        return res.status(400).json({
          success: false,
          message: "Invalid earn type. Must be one of: car, scooter, bicycle, truck"
        });
      }

      // Get driver from temporary token
      const tempToken = req.header('Authorization')?.split(" ")[1];
      if (!tempToken) {
        return res.status(401).json({ 
          success: false,
          message: "Temporary token required" 
        });
      }

      let decoded;
      try {
        decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
        // REMOVED: Strict step validation - now flexible
      } catch (error) {
        return res.status(401).json({ 
          success: false,
          message: "Invalid or expired temporary token" 
        });
      }

      // Find driver (either by ID from token or by phone)
      let driver;
      if (decoded.id) {
        driver = await Driver.findById(decoded.id);
      } else if (decoded.phone) {
        driver = await Driver.findOne({ phone: decoded.phone });
      }

      if (!driver) {
        return res.status(404).json({ 
          success: false,
          message: "Driver not found" 
        });
      }

      // Update driver with earn type information
      driver.earnType = earnType;
      driver.city = city;
      driver.referralCode = referralCode || null;
      driver.registrationStep = 'earn_type_completed';
      await driver.save();

      // Generate token for next step
      const documentToken = jwt.sign(
        { 
          id: driver._id,
          phone: driver.phone,
          email: driver.email,
          step: 'earn_type_completed'
        }, 
        process.env.JWT_SECRET, 
        { expiresIn: "2h" }
      );

      // Remove password from response
      const driverResponse = driver.toObject();
      delete driverResponse.password;
      try {
        await NotificationService.notifyProfileUpdated(driver._id, ['earnType', 'city']);
      } catch (notificationError) {
        console.error('Failed to send earn type setup notification:', notificationError);
      }
      res.json({
        success: true,
        message: "Earn type setup completed successfully",
        tempToken: documentToken,
        driver: driverResponse,
        nextStep: "upload_documents",
        allowedActions: getNextAllowedActions(driver, 'earn_type_completed')
      });

    } catch (error) {
      console.error('Error in setupEarnType:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to setup earn type", 
        error: error.message 
      });
    }
  }

  // Step 5: Upload driver documents - COMPLETELY FLEXIBLE VERSION
  async uploadDocument(req, res) {
    try {
      console.log('Upload document request received:', {
        documentType: req.params.documentType,
        hasFile: !!req.file,
        authHeader: !!req.header('Authorization')
      });

      const { documentType } = req.params;
      const validDocTypes = ['driversLicense', 'profilePhoto', 'socialInsuranceNumber', 'vehicleRegistration', 'vehicleInsurance'];
      
      if (!validDocTypes.includes(documentType)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid document type',
          validTypes: validDocTypes
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded'
        });
      }

      console.log('File details:', {
        filename: req.file.filename,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.path,
        public_id: req.file.public_id || req.file.filename
      });

      // Get driver from temporary token
      const tempToken = req.header('Authorization')?.split(" ")[1];
      if (!tempToken) {
        return res.status(401).json({ 
          success: false,
          message: "Temporary token required" 
        });
      }

      let decoded;
      try {
        decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
        console.log('Token decoded:', { id: decoded.id, step: decoded.step, phone: decoded.phone });
      } catch (error) {
        console.error('Token verification error:', error);
        return res.status(401).json({ 
          success: false,
          message: "Invalid or expired temporary token",
          error: error.message
        });
      }

      // Find driver (flexible approach)
      let driver;
      if (decoded.id) {
        driver = await Driver.findById(decoded.id);
      } else if (decoded.phone) {
        driver = await Driver.findOne({ phone: decoded.phone });
      }

      if (!driver) {
        console.error('Driver not found:', { id: decoded.id, phone: decoded.phone });
        return res.status(404).json({ 
          success: false,
          message: "Driver not found" 
        });
      }

      console.log('Driver found:', { 
        id: driver._id, 
        registrationStep: driver.registrationStep,
        tokenStep: decoded.step 
      });

      // NO STRICT STEP VALIDATION - Allow document upload at any stage
      // Just provide helpful guidance if they're missing prerequisites

      let warnings = [];
      
      if (!driver.name || !driver.email) {
        warnings.push("Consider completing your basic information first for a better experience");
      }
      
      if (!driver.earnType || !driver.city) {
        warnings.push("Consider setting up your earn type and city for a complete profile");
      }

      // Initialize documents object if it doesn't exist
      if (!driver.documents) {
        driver.documents = {};
        console.log('Initialized documents object');
      }

      // Get public_id - handle both cases
      const publicId = req.file.public_id || req.file.filename;
      
      // Delete old document from Cloudinary if exists
      if (driver.documents[documentType] && driver.documents[documentType].publicId) {
        try {
          console.log('Deleting old document:', driver.documents[documentType].publicId);
          await cloudinary.uploader.destroy(driver.documents[documentType].publicId);
          console.log('Old document deleted successfully');
        } catch (deleteError) {
          console.error('Error deleting old document:', deleteError);
          // Don't fail the upload if old document deletion fails
        }
      }

      // Validate that cloudinary upload was successful
      if (!req.file.path) {
        console.error('Cloudinary upload incomplete:', req.file);
        return res.status(500).json({
          success: false,
          error: 'File upload to cloud storage failed'
        });
      }

      // Save new document info
      driver.documents[documentType] = {
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        url: req.file.path,
        publicId: publicId,
        uploadedAt: new Date()
      };

      // Update registration step intelligently
      const currentStep = getCurrentRegistrationStep(driver, decoded.step);
      if (currentStep === 'verified_phone' || currentStep === 'basic_info_completed' || currentStep === 'earn_type_completed') {
        driver.registrationStep = 'documents_uploading';
      }
      
      console.log('Saving driver with new document...');
      await driver.save();
      console.log('Driver saved successfully');

      // Generate updated token for continued operations
      const updatedToken = jwt.sign(
        { 
          id: driver._id,
          phone: driver.phone,
          email: driver.email,
          step: 'documents_uploading'
        }, 
        process.env.JWT_SECRET, 
        { expiresIn: "2h" }
      );

      const response = {
        success: true,
        message: 'Document uploaded successfully',
        tempToken: updatedToken,
        document: {
          type: documentType,
          url: req.file.path,
          uploadedAt: driver.documents[documentType].uploadedAt
        },
        uploadedDocuments: Object.keys(driver.documents),
        allowedActions: getNextAllowedActions(driver, 'documents_uploading')
      };

      // Add warnings if any
      if (warnings.length > 0) {
        response.warnings = warnings;
      }

      res.json(response);

    } catch (error) {
      console.error('Document upload error:', error);
      console.error('Error stack:', error.stack);
      
      // Clean up uploaded file if database save fails
      const publicId = req.file?.public_id || req.file?.filename;
      if (publicId) {
        try {
          console.log('Cleaning up uploaded file due to error:', publicId);
          await cloudinary.uploader.destroy(publicId);
          console.log('Cleanup successful');
        } catch (cleanupError) {
          console.error('Error cleaning up uploaded file:', cleanupError);
        }
      }
      try {
        await NotificationService.notifyDocumentUploaded(driver._id, documentType);
      } catch (notificationError) {
        console.error('Failed to send document upload notification:', notificationError);
      }
      res.status(500).json({ 
        success: false,
        error: 'Failed to upload document',
        message: error.message,
        // In development, include more details
        ...(process.env.NODE_ENV === 'development' && { 
          stack: error.stack,
          details: error.toString()
        })
      });
    }
  }

  // Step 6: Complete full registration process - FLEXIBLE VERSION
  async completeFullRegistration(req, res) {
    try {
      // Get driver from temporary token
      const tempToken = req.header('Authorization')?.split(" ")[1];
      if (!tempToken) {
        return res.status(401).json({ 
          success: false,
          message: "Temporary token required" 
        });
      }

      let decoded;
      try {
        decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
        // REMOVED: Strict step validation
      } catch (error) {
        return res.status(401).json({ 
          success: false,
          message: "Invalid or expired temporary token" 
        });
      }

      // Find driver (flexible approach)
      let driver;
      if (decoded.id) {
        driver = await Driver.findById(decoded.id);
      } else if (decoded.phone) {
        driver = await Driver.findOne({ phone: decoded.phone });
      }

      if (!driver) {
        return res.status(404).json({ 
          success: false,
          message: "Driver not found" 
        });
      }

      // Check if ALL requirements are met (but don't be strict about steps)
      const errors = [];

      // Check basic info
      if (!driver.name || !driver.email || !driver.firstName || !driver.lastName) {
        errors.push("Basic information incomplete (name, email required)");
      }

      // Check earn type setup
      if (!driver.earnType || !driver.city) {
        errors.push("Earn type and city must be set");
      }

      // Check required documents
      const requiredDocs = ['driversLicense', 'profilePhoto'];
      const uploadedDocs = driver.documents ? Object.keys(driver.documents) : [];
      const missingDocs = requiredDocs.filter(doc => !uploadedDocs.includes(doc));

      if (missingDocs.length > 0) {
        errors.push(`Missing required documents: ${missingDocs.join(', ')}`);
      }

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Cannot complete registration - requirements not met",
          errors: errors,
          missingDocuments: missingDocs,
          allowedActions: getNextAllowedActions(driver, driver.registrationStep)
        });
      }

      // Mark driver as verified and complete registration
      driver.verified = true;
      driver.registrationStep = 'completed';
      driver.available = false; // Driver can set availability later
      await driver.save();

      // Generate main JWT token for authenticated access
      const mainToken = jwt.sign(
        { 
          id: driver._id, 
          phone: driver.phone,
          email: driver.email,
          type: 'driver'
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Remove password from response
      const driverResponse = driver.toObject();
      delete driverResponse.password;
      try {
        await NotificationService.notifyRegistrationCompleted(driver._id);
        await NotificationService.notifyVerificationApproved(driver._id);
      } catch (notificationError) {
        console.error('Failed to send registration completion notifications:', notificationError);
      }
      res.json({
        success: true,
        message: "Registration completed successfully! Welcome to Errand.",
        token: mainToken,
        driver: driverResponse,
        status: "registration_complete"
      });

    } catch (error) {
      console.error('Error in completeFullRegistration:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to complete registration", 
        error: error.message 
      });
    }
  }

  // Get registration status - FLEXIBLE VERSION
  async getRegistrationStatus(req, res) {
    try {
      // Get driver from temporary token
      const tempToken = req.header('Authorization')?.split(" ")[1];
      if (!tempToken) {
        return res.status(401).json({ 
          success: false,
          message: "Temporary token required" 
        });
      }

      let decoded;
      try {
        decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
      } catch (error) {
        return res.status(401).json({ 
          success: false,
          message: "Invalid or expired temporary token" 
        });
      }

      // Find driver (flexible approach)
      let driver;
      if (decoded.id) {
        driver = await Driver.findById(decoded.id);
      } else if (decoded.phone) {
        driver = await Driver.findOne({ phone: decoded.phone });
      }

      if (!driver) {
        return res.status(404).json({ 
          success: false,
          message: "Driver not found" 
        });
      }

      // Calculate progress dynamically
      let progress = 0;
      const completedSteps = [];

      // Check phone verification
      if (decoded.phone || driver.phone) {
        completedSteps.push('verified_phone');
        progress += 20;
      }

      // Check basic info
      if (driver.name && driver.email && driver.firstName && driver.lastName) {
        completedSteps.push('basic_info_completed');
        progress += 20;
      }

      // Check earn type setup
      if (driver.earnType && driver.city) {
        completedSteps.push('earn_type_completed');
        progress += 20;
      }

      // Check documents
      const uploadedDocuments = driver.documents ? Object.keys(driver.documents) : [];
      if (uploadedDocuments.length > 0) {
        completedSteps.push('documents_uploading');
        progress += 20;
      }

      // Check completion
      const requiredDocs = ['driversLicense', 'profilePhoto'];
      const hasAllRequiredDocs = requiredDocs.every(doc => uploadedDocuments.includes(doc));
      if (driver.verified || (hasAllRequiredDocs && driver.earnType && driver.city && driver.name)) {
        completedSteps.push('completed');
        progress += 20;
      }

      const currentStep = driver.registrationStep || decoded.step || 'verified_phone';

      res.json({
        success: true,
        registrationStep: currentStep,
        progress: Math.min(progress, 100),
        completedSteps: completedSteps,
        driver: {
          id: driver._id,
          name: driver.name,
          email: driver.email,
          phone: driver.phone,
          earnType: driver.earnType,
          city: driver.city,
          referralCode: driver.referralCode,
          verified: driver.verified
        },
        documents: {
          uploaded: uploadedDocuments,
          required: requiredDocs,
          missing: requiredDocs.filter(doc => !uploadedDocuments.includes(doc))
        },
        allowedActions: getNextAllowedActions(driver, currentStep)
      });

    } catch (error) {
      console.error('Error in getRegistrationStatus:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to get registration status", 
        error: error.message 
      });
    }
  }

  // Delete uploaded document - FLEXIBLE VERSION
  async deleteDocument(req, res) {
    try {
      const { documentType } = req.params;
      const validDocTypes = ['driversLicense', 'profilePhoto', 'socialInsuranceNumber', 'vehicleRegistration', 'vehicleInsurance'];
      
      if (!validDocTypes.includes(documentType)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid document type'
        });
      }

      // Get driver from temporary token
      const tempToken = req.header('Authorization')?.split(" ")[1];
      if (!tempToken) {
        return res.status(401).json({ 
          success: false,
          message: "Temporary token required" 
        });
      }

      let decoded;
      try {
        decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
      } catch (error) {
        return res.status(401).json({ 
          success: false,
          message: "Invalid or expired temporary token" 
        });
      }

      // Find driver (flexible approach)
      let driver;
      if (decoded.id) {
        driver = await Driver.findById(decoded.id);
      } else if (decoded.phone) {
        driver = await Driver.findOne({ phone: decoded.phone });
      }

      if (!driver) {
        return res.status(404).json({
          success: false,
          error: 'Driver not found'
        });
      }

      if (!driver.documents || !driver.documents[documentType]) {
        return res.status(404).json({
          success: false,
          error: 'Document not found'
        });
      }

      // Delete from Cloudinary
      if (driver.documents[documentType].publicId) {
        try {
          await cloudinary.uploader.destroy(driver.documents[documentType].publicId);
        } catch (deleteError) {
          console.error('Error deleting document from Cloudinary:', deleteError);
        }
      }

      // Remove from database
      driver.documents[documentType] = undefined;
      await driver.save();

      res.json({
        success: true,
        message: 'Document deleted successfully',
        uploadedDocuments: Object.keys(driver.documents || {}),
        allowedActions: getNextAllowedActions(driver, driver.registrationStep)
      });

    } catch (error) {
      console.error('Document deletion error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to delete document' 
      });
    }
  }

  // Resend OTP - ALWAYS WORKS
  async resendOtp(req, res) {
    try {
      const { phone } = req.body;

      if (!phone) {
        return res.status(400).json({ message: "Phone number is required" });
      }

      const otpCode = generateOTP();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      // Delete existing OTP and create new one
      await Otp.deleteMany({ phone, type: 'driver_registration' });
      await Otp.create({ 
        phone, 
        code: otpCode, 
        expiresAt,
        type: 'driver_registration'
      });

      // Log OTP instead of sending via Twilio
      console.log(`Resent OTP for ${phone}: ${otpCode}`);

      res.status(200).json({ 
        message: "OTP resent successfully",
        // For testing purposes, include OTP in response (remove in production)
        otp: otpCode
      });

    } catch (error) {
      console.error('Error in resendOtp:', error);
      res.status(500).json({ 
        message: "Failed to resend OTP", 
        error: error.message 
      });
    }
  }

  // Driver login - ALWAYS WORKS IF CREDENTIALS ARE CORRECT
  async login(req, res) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      // Find driver by email
      const driver = await Driver.findOne({ email });
      if (!driver) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Check password
      const isValidPassword = await bcrypt.compare(password, driver.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Generate JWT token
      const token = jwt.sign(
        { 
          id: driver._id, 
          phone: driver.phone,
          email: driver.email,
          type: 'driver'
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Remove password from response
      const driverResponse = driver.toObject();
      delete driverResponse.password;
      try {
        // Optional: Welcome back notification for returning drivers
        if (driver.verified) {
          await NotificationService.createNotification(
            driver._id,
            'general',
            'Welcome Back!',
            'You have successfully logged in to Errand.',
            {},
            { priority: 'low' }
          );
        }
      } catch (notificationError) {
        console.error('Failed to send login notification:', notificationError);
      }
      res.json({
        message: "Login successful",
        token,
        driver: driverResponse,
        registrationStatus: {
          step: driver.registrationStep || 'basic_info_completed',
          verified: driver.verified,
          allowedActions: getNextAllowedActions(driver, driver.registrationStep)
        }
      });

    } catch (error) {
      console.error('Error in login:', error);
      res.status(500).json({ 
        message: "Login failed", 
        error: error.message 
      });
    }
  }

  // Middleware for handling document uploads - COMPLETELY FLEXIBLE
  getUploadMiddleware = () => {
    return [
      // First middleware: Extract and validate token, attach user info to request
      (req, res, next) => {
        console.log('Pre-processing upload request for:', req.params.documentType);
        
        try {
          const tempToken = req.header('Authorization')?.split(" ")[1];
          if (!tempToken) {
            return res.status(401).json({ 
              success: false,
              message: "Temporary token required" 
            });
          }
  
          const decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
          console.log('Token decoded successfully:', { id: decoded.id, phone: decoded.phone });
          
          // Attach user info to request for multer to use
          req.user = {
            id: decoded.id,
            phone: decoded.phone,
            email: decoded.email,
            step: decoded.step
          };
          
          next();
        } catch (error) {
          console.error('Token preprocessing error:', error);
          return res.status(401).json({ 
            success: false,
            message: "Invalid or expired temporary token",
            error: error.message
          });
        }
      },
      
      // Second middleware: Handle file upload with multer
      (req, res, next) => {
        console.log('Processing file upload with multer...');
        
        upload.single('document')(req, res, (err) => {
          if (err) {
            console.error('Multer middleware error:', err);
            return handleMulterError(err, req, res, next);
          }
          
          console.log('Multer processing completed successfully');
          if (req.file) {
            console.log('File processed by multer:', {
              originalname: req.file.originalname,
              mimetype: req.file.mimetype,
              size: req.file.size,
              path: req.file.path
            });
          }
          
          next();
        });
      }
    ];
  };

  // New method: Get driver profile (works with any valid token)
  async getProfile(req, res) {
    try {
      const token = req.header('Authorization')?.split(" ")[1];
      if (!token) {
        return res.status(401).json({ 
          success: false,
          message: "Token required" 
        });
      }

      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
      } catch (error) {
        return res.status(401).json({ 
          success: false,
          message: "Invalid or expired token" 
        });
      }

      // Find driver
      let driver;
      if (decoded.id) {
        driver = await Driver.findById(decoded.id);
      } else if (decoded.phone) {
        driver = await Driver.findOne({ phone: decoded.phone });
      }

      if (!driver) {
        return res.status(404).json({ 
          success: false,
          message: "Driver not found" 
        });
      }

      // Remove password from response
      const driverResponse = driver.toObject();
      delete driverResponse.password;

      res.json({
        success: true,
        driver: driverResponse,
        allowedActions: getNextAllowedActions(driver, driver.registrationStep)
      });

    } catch (error) {
      console.error('Error in getProfile:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to get profile", 
        error: error.message 
      });
    }
  }

  // New method: Update any driver field at any time (flexible update)
  async updateProfile(req, res) {
    try {
      const token = req.header('Authorization')?.split(" ")[1];
      if (!token) {
        return res.status(401).json({ 
          success: false,
          message: "Token required" 
        });
      }

      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
      } catch (error) {
        return res.status(401).json({ 
          success: false,
          message: "Invalid or expired token" 
        });
      }

      // Find driver
      let driver;
      if (decoded.id) {
        driver = await Driver.findById(decoded.id);
      } else if (decoded.phone) {
        driver = await Driver.findOne({ phone: decoded.phone });
      }

      if (!driver) {
        return res.status(404).json({ 
          success: false,
          message: "Driver not found" 
        });
      }

      // Extract updatable fields from request
      const {
        firstName,
        lastName, 
        email,
        earnType,
        city,
        referralCode,
        available
      } = req.body;

      // Update fields if provided
      if (firstName) {
        driver.firstName = firstName;
        if (lastName) {
          driver.name = `${firstName} ${lastName}`;
        }
      }
      
      if (lastName) {
        driver.lastName = lastName;
        if (driver.firstName) {
          driver.name = `${driver.firstName} ${lastName}`;
        }
      }

      if (email) {
        // Check if email already exists for another driver
        const existingEmail = await Driver.findOne({ 
          email,
          _id: { $ne: driver._id }
        });
        if (existingEmail) {
          return res.status(409).json({ 
            success: false,
            message: "Email already registered" 
          });
        }
        driver.email = email;
      }

      if (earnType) {
        const validEarnTypes = ['car', 'scooter', 'bicycle', 'truck'];
        if (!validEarnTypes.includes(earnType)) {
          return res.status(400).json({
            success: false,
            message: "Invalid earn type. Must be one of: car, scooter, bicycle, truck"
          });
        }
        driver.earnType = earnType;
      }

      if (city) driver.city = city;
      if (referralCode !== undefined) driver.referralCode = referralCode;
      if (available !== undefined) driver.available = available;

      await driver.save();

      // Generate updated token
      const updatedToken = jwt.sign(
        { 
          id: driver._id,
          phone: driver.phone,
          email: driver.email,
          type: decoded.type || 'driver'
        }, 
        process.env.JWT_SECRET, 
        { expiresIn: decoded.type === 'driver' ? '7d' : '2h' }
      );

      // Remove password from response
      const driverResponse = driver.toObject();
      delete driverResponse.password;

      res.json({
        success: true,
        message: "Profile updated successfully",
        token: updatedToken,
        driver: driverResponse,
        allowedActions: getNextAllowedActions(driver, driver.registrationStep)
      });

    } catch (error) {
      console.error('Error in updateProfile:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to update profile", 
        error: error.message 
      });
    }
  }
}

module.exports = new DriverRegistrationController();