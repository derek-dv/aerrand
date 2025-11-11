const express = require('express');
const router = express.Router();
const driverRegistrationController = require('../controllers/driverRegistrationController');
const driverController = require('../controllers/driverController');
const authMiddleware = require('../middleware/auth');

// ===============================
// REGISTRATION FLOW ROUTES
// ===============================

// Step 1: Phone registration and OTP
router.post('/register/phone', driverRegistrationController.registerPhone);
router.post('/register/verify-otp', driverRegistrationController.verifyOtp);
router.post('/register/resend-otp', driverRegistrationController.resendOtp);

// Step 2: Complete basic profile (name, email, password)
router.post('/register/complete', driverRegistrationController.completeRegistration);

// Step 3: Setup earn type and location
router.post('/register/earn-type', driverRegistrationController.setupEarnType);

// Step 4: Document uploads
router.post('/register/upload-document/:documentType', 
  ...driverRegistrationController.getUploadMiddleware(),
  driverRegistrationController.uploadDocument
);

// Step 5: Complete full registration
router.post('/register/finalize', driverRegistrationController.completeFullRegistration);

// Registration status and management
router.get('/register/status', driverRegistrationController.getRegistrationStatus);
router.delete('/register/document/:documentType', driverRegistrationController.deleteDocument);

// ===============================
// AUTHENTICATION ROUTES
// ===============================

router.post('/login', driverRegistrationController.login);

// ===============================
// PROTECTED ROUTES (Require full authentication)
// ===============================

// Legacy routes (keeping for backward compatibility)
router.post('/upload-license', authMiddleware, driverController.uploadLicense);
router.post('/verify-identity', authMiddleware, driverController.verifyIdentity);

// Profile management
router.get('/profile', authMiddleware, driverController.getProfile);
router.put('/profile', authMiddleware, driverController.updateProfile);

// Availability and status
router.post('/availability', authMiddleware, driverController.setAvailability);
router.get('/status', authMiddleware, driverController.getStatus);

// Location updates
router.post('/location', authMiddleware, driverController.updateLocation);

// Document management for verified drivers
router.post('/documents/upload/:documentType', 
  authMiddleware,
  ...driverRegistrationController.getUploadMiddleware(),
  async (req, res) => {
    // This route allows verified drivers to update their documents
    try {
      const { documentType } = req.params;
      const validDocTypes = ['driversLicense', 'profilePhoto', 'socialInsuranceNumber', 'vehicleRegistration', 'vehicleInsurance'];
      
      if (!validDocTypes.includes(documentType)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid document type'
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded'
        });
      }

      const driver = await Driver.findById(req.user.id);
      if (!driver) {
        return res.status(404).json({ 
          success: false,
          message: "Driver not found" 
        });
      }

      // Initialize documents object if it doesn't exist
      if (!driver.documents) {
        driver.documents = {};
      }

      // Delete old document from Cloudinary if exists
      if (driver.documents[documentType] && driver.documents[documentType].publicId) {
        try {
          await cloudinary.uploader.destroy(driver.documents[documentType].publicId);
        } catch (deleteError) {
          console.error('Error deleting old document:', deleteError);
        }
      }

      // Save new document info
      driver.documents[documentType] = {
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        url: req.file.path,
        publicId: req.file.public_id,
        uploadedAt: new Date()
      };

      await driver.save();

      res.json({
        success: true,
        message: 'Document updated successfully',
        document: {
          type: documentType,
          url: req.file.path,
          uploadedAt: driver.documents[documentType].uploadedAt
        }
      });

    } catch (error) {
      console.error('Document update error:', error);
      
      // Clean up uploaded file if database save fails
      if (req.file && req.file.public_id) {
        try {
          await cloudinary.uploader.destroy(req.file.public_id);
        } catch (cleanupError) {
          console.error('Error cleaning up uploaded file:', cleanupError);
        }
      }
      
      res.status(500).json({ 
        success: false,
        error: 'Failed to update document' 
      });
    }
  }
);

router.delete('/documents/:documentType', authMiddleware, async (req, res) => {
  // This route allows verified drivers to delete their documents
  try {
    const { documentType } = req.params;
    const validDocTypes = ['driversLicense', 'profilePhoto', 'socialInsuranceNumber', 'vehicleRegistration', 'vehicleInsurance'];
    
    if (!validDocTypes.includes(documentType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid document type'
      });
    }

    const driver = await Driver.findById(req.user.id);
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
      message: 'Document deleted successfully'
    });

  } catch (error) {
    console.error('Document deletion error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete document' 
    });
  }
});

module.exports = router;