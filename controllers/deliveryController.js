const Delivery = require('../models/Delivery');
const Sender = require("../models/senderReceiver"); 
const Driver = require('../models/Driver');
const mongoose = require('mongoose');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { NotificationService } = require('../services/NotificationService');
// Configure Cloudinary (add this if not already configured)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// Cloudinary storage configuration for delivery photos
const deliveryPhotoStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'delivery-photos',
    allowed_formats: ['jpg', 'jpeg', 'png'],
    transformation: [
      { width: 1200, height: 1200, crop: 'limit', quality: 'auto' },
      { format: 'auto' }
    ],
    public_id: (req, file) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const driverId = req.user?.id || req.driver?._id || 'unknown';
      const deliveryId = req.params.deliveryId;
      const photoType = req.route.path.includes('dropoff') ? 'dropoff' : 'escrow';
      
      return `${photoType}-${deliveryId}-${driverId}-${uniqueSuffix}`;
    }
  },
});

const deliveryPhotoUpload = multer({ 
  storage: deliveryPhotoStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      const error = new Error('Only image files are allowed');
      error.code = 'INVALID_FILE_TYPE';
      cb(error, false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1
  }
});

// Handle multer errors for delivery photos
const handleDeliveryPhotoError = (err, req, res, next) => {
  console.error('Delivery photo upload error:', err);

  if (err instanceof multer.MulterError) {
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({ 
          success: false,
          error: 'File too large',
          message: 'Photo size exceeds the 10MB limit'
        });
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({ 
          success: false,
          error: 'Unexpected field',
          message: 'Expected field name: photo'
        });
      default:
        return res.status(400).json({ 
          success: false,
          error: 'Upload error',
          message: err.message
        });
    }
  }
  
  if (err.code === 'INVALID_FILE_TYPE') {
    return res.status(400).json({ 
      success: false,
      error: 'Invalid file type',
      message: 'Only image files (JPG, JPEG, PNG) are allowed'
    });
  }

  return res.status(500).json({ 
    success: false,
    error: 'Server error',
    message: 'An unexpected error occurred during photo upload'
  });
};


// Helper function to validate ObjectId
const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id) && id !== ':deliveryId';
};

const deliveryController = {


  // Middleware for handling photo uploads
  getUploadMiddleware: () => {
    return [
      (req, res, next) => {
        deliveryPhotoUpload.single('photo')(req, res, (err) => {
          if (err) {
            return handleDeliveryPhotoError(err, req, res, next);
          }
          next();
        });
      }
    ];
  },

  // Upload drop-off photo
  uploadDropOffPhoto: async (req, res) => {
    try {
      const { deliveryId } = req.params;
      const driverId = req.user?.id || req.user?._id || req.driver?._id || req.driver?.id;

      console.log('=== UPLOADING DROP-OFF PHOTO ===');
      console.log('DeliveryId:', deliveryId);
      console.log('DriverId:', driverId);
      console.log('File:', req.file ? req.file.originalname : 'No file');

      // Validate deliveryId
      if (!isValidObjectId(deliveryId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid delivery ID format'
        });
      }

      // Check if file was uploaded
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No photo uploaded'
        });
      }

      // Find the delivery and verify it belongs to the driver
      const delivery = await Delivery.findOne({
        _id: deliveryId,
        driverId: driverId,
        status: 'in-transit' // Only allow photo upload during transit
      });

      if (!delivery) {
        // Clean up uploaded file if delivery not found
        if (req.file.public_id) {
          try {
            await cloudinary.uploader.destroy(req.file.public_id);
          } catch (cleanupError) {
            console.error('Error cleaning up uploaded file:', cleanupError);
          }
        }

        return res.status(404).json({
          success: false,
          message: 'Delivery not found or not in transit'
        });
      }

      // Delete old drop-off photo if exists
      if (delivery.photos && delivery.photos.dropOff && delivery.photos.dropOff.publicId) {
        try {
          await cloudinary.uploader.destroy(delivery.photos.dropOff.publicId);
        } catch (deleteError) {
          console.error('Error deleting old drop-off photo:', deleteError);
        }
      }

      // Initialize photos object if it doesn't exist
      if (!delivery.photos) {
        delivery.photos = {};
      }

      // Save drop-off photo info
      delivery.photos.dropOff = {
        url: req.file.path,
        publicId: req.file.public_id || req.file.filename,
        uploadedAt: new Date(),
        filename: req.file.originalname
      };

      await delivery.save();
      try {
        // Notify that photo was uploaded successfully
        await NotificationService.createNotification(
          driverId,
          'delivery_photo_uploaded',
          'Drop-off Photo Uploaded',
          'Your drop-off photo has been uploaded successfully.',
          {
            deliveryId: delivery._id,
            photoType: 'dropoff'
          },
          { priority: 'medium' }
        );
      } catch (notificationError) {
        console.error('Failed to send photo upload notification:', notificationError);
      }

      res.json({
        success: true,
        message: 'Drop-off photo uploaded successfully',
        photo: {
          url: req.file.path,
          uploadedAt: delivery.photos.dropOff.uploadedAt
        },
        delivery: {
          id: delivery._id,
          status: delivery.status
        }
      });

    } catch (error) {
      console.error('Error uploading drop-off photo:', error);
      
      // Clean up uploaded file on error
      if (req.file && req.file.public_id) {
        try {
          await cloudinary.uploader.destroy(req.file.public_id);
        } catch (cleanupError) {
          console.error('Error cleaning up uploaded file:', cleanupError);
        }
      }

      res.status(500).json({
        success: false,
        message: 'Failed to upload drop-off photo',
        error: error.message
      });
    }
  },

  // Upload escrow photo
  uploadEscrowPhoto: async (req, res) => {
    try {
      const { deliveryId } = req.params;
      const driverId = req.user?.id || req.user?._id || req.driver?._id || req.driver?.id;

      console.log('=== UPLOADING ESCROW PHOTO ===');
      console.log('DeliveryId:', deliveryId);
      console.log('DriverId:', driverId);
      console.log('File:', req.file ? req.file.originalname : 'No file');

      // Validate deliveryId
      if (!isValidObjectId(deliveryId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid delivery ID format'
        });
      }

      // Check if file was uploaded
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No photo uploaded'
        });
      }

      // Find the delivery and verify it belongs to the driver
      const delivery = await Delivery.findOne({
        _id: deliveryId,
        driverId: driverId,
        status: { $in: ['accepted', 'in-transit'] } // Allow escrow photo during accepted or in-transit
      });

      if (!delivery) {
        // Clean up uploaded file if delivery not found
        if (req.file.public_id) {
          try {
            await cloudinary.uploader.destroy(req.file.public_id);
          } catch (cleanupError) {
            console.error('Error cleaning up uploaded file:', cleanupError);
          }
        }

        return res.status(404).json({
          success: false,
          message: 'Delivery not found or not in accepted/in-transit status'
        });
      }

      // Delete old escrow photo if exists
      if (delivery.photos && delivery.photos.escrow && delivery.photos.escrow.publicId) {
        try {
          await cloudinary.uploader.destroy(delivery.photos.escrow.publicId);
        } catch (deleteError) {
          console.error('Error deleting old escrow photo:', deleteError);
        }
      }

      // Initialize photos object if it doesn't exist
      if (!delivery.photos) {
        delivery.photos = {};
      }

      // Save escrow photo info
      delivery.photos.escrow = {
        url: req.file.path,
        publicId: req.file.public_id || req.file.filename,
        uploadedAt: new Date(),
        filename: req.file.originalname
      };

      await delivery.save();
      try {
        // Notify that escrow photo was uploaded successfully
        await NotificationService.createNotification(
          driverId,
          'delivery_photo_uploaded',
          'Escrow Photo Uploaded',
          'Your escrow photo has been uploaded successfully.',
          {
            deliveryId: delivery._id,
            photoType: 'escrow'
          },
          { priority: 'medium' }
        );
      } catch (notificationError) {
        console.error('Failed to send escrow photo notification:', notificationError);
      }

      res.json({
        success: true,
        message: 'Escrow photo uploaded successfully',
        photo: {
          url: req.file.path,
          uploadedAt: delivery.photos.escrow.uploadedAt
        },
        delivery: {
          id: delivery._id,
          status: delivery.status
        }
      });

    } catch (error) {
      console.error('Error uploading escrow photo:', error);
      
      // Clean up uploaded file on error
      if (req.file && req.file.public_id) {
        try {
          await cloudinary.uploader.destroy(req.file.public_id);
        } catch (cleanupError) {
          console.error('Error cleaning up uploaded file:', cleanupError);
        }
      }

      res.status(500).json({
        success: false,
        message: 'Failed to upload escrow photo',
        error: error.message
      });
    }
  },

  // Get delivery photos
  getDeliveryPhotos: async (req, res) => {
    try {
      const { deliveryId } = req.params;
      const driverId = req.user?.id || req.user?._id || req.driver?._id || req.driver?.id;

      if (!isValidObjectId(deliveryId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid delivery ID format'
        });
      }

      const delivery = await Delivery.findOne({
        _id: deliveryId,
        driverId: driverId
      }).select('photos');

      if (!delivery) {
        return res.status(404).json({
          success: false,
          message: 'Delivery not found'
        });
      }

      res.json({
        success: true,
        photos: delivery.photos || {},
        deliveryId: deliveryId
      });

    } catch (error) {
      console.error('Error getting delivery photos:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get delivery photos',
        error: error.message
      });
    }
  },

  // Delete delivery photo
  deleteDeliveryPhoto: async (req, res) => {
    try {
      const { deliveryId, photoType } = req.params;
      const driverId = req.user?.id || req.user?._id || req.driver?._id || req.driver?.id;

      if (!isValidObjectId(deliveryId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid delivery ID format'
        });
      }

      if (!['dropoff', 'escrow'].includes(photoType)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid photo type. Must be "dropoff" or "escrow"'
        });
      }

      const delivery = await Delivery.findOne({
        _id: deliveryId,
        driverId: driverId
      });

      if (!delivery) {
        return res.status(404).json({
          success: false,
          message: 'Delivery not found'
        });
      }

      const photoKey = photoType === 'dropoff' ? 'dropOff' : 'escrow';
      
      if (!delivery.photos || !delivery.photos[photoKey]) {
        return res.status(404).json({
          success: false,
          message: 'Photo not found'
        });
      }

      // Delete from Cloudinary
      if (delivery.photos[photoKey].publicId) {
        try {
          await cloudinary.uploader.destroy(delivery.photos[photoKey].publicId);
        } catch (deleteError) {
          console.error('Error deleting photo from Cloudinary:', deleteError);
        }
      }

      // Remove from database
      delivery.photos[photoKey] = undefined;
      await delivery.save();

      res.json({
        success: true,
        message: `${photoType.charAt(0).toUpperCase() + photoType.slice(1)} photo deleted successfully`
      });

    } catch (error) {
      console.error('Error deleting delivery photo:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete photo',
        error: error.message
      });
    }
  },
  
  // Enhanced debug version of getAvailableDeliveries
  getAvailableDeliveries: async (req, res) => {
    try {
      console.log('=== DEBUGGING GET AVAILABLE DELIVERIES ===');
      
      // Debug authentication
      console.log('req.user:', req.user);
      console.log('req.driver:', req.driver);
      console.log('req.headers.authorization:', req.headers.authorization);
      
      // Step 1: Check total deliveries in database
      const totalCount = await Delivery.countDocuments({});
      console.log(`Total deliveries in database: ${totalCount}`);
      
      // Step 2: Check deliveries by status
      const statusCounts = await Delivery.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]);
      console.log('Deliveries by status:', statusCounts);
      
      // Step 3: Check upcoming deliveries
      const upcomingCount = await Delivery.countDocuments({ status: 'upcoming' });
      console.log(`Upcoming deliveries: ${upcomingCount}`);
      
      // Step 4: Check deliveries with null driverId
      const nullDriverCount = await Delivery.countDocuments({ 
        status: 'upcoming',
        driverId: null 
      });
      console.log(`Upcoming deliveries with null driverId: ${nullDriverCount}`);
      
      // Step 5: Check deliveries without driverId field
      const noDriverFieldCount = await Delivery.countDocuments({ 
        status: 'upcoming',
        driverId: { $exists: false } 
      });
      console.log(`Upcoming deliveries without driverId field: ${noDriverFieldCount}`);
      
      // Step 6: Get raw sample data to inspect
      const rawSample = await Delivery.find({}).limit(3).lean();
      console.log('Raw sample deliveries:', JSON.stringify(rawSample, null, 2));
      
      // Step 7: Try the actual query without population first
      const queryWithoutPopulate = await Delivery.find({
        status: 'upcoming',
        $or: [
          { driverId: null },
          { driverId: { $exists: false } }
        ]
      }).lean();
      
      console.log(`Query result without populate: ${queryWithoutPopulate.length} deliveries`);
      if (queryWithoutPopulate.length > 0) {
        console.log('First result:', JSON.stringify(queryWithoutPopulate[0], null, 2));
      }
      
      // Step 8: Try with population (original query)
      const availableDeliveries = await Delivery.find({
        // status: 'upcoming',
        $or: [
          { driverId: null },
          { driverId: { $exists: false } }
        ]
      })
      .populate('senderId', 'fullName email') // This might fail if User model doesn't exist
      .sort({ createdAt: -1 });

      availableDeliveries.forEach((delivery, index) => {
        console.log(`Delivery ${index + 1}: ID=${delivery._id}, DriverId=${delivery.driverId}, Sender=${delivery.senderId ? delivery.senderId.name : 'N/A'}`)
      })


      console.log(`Found ${availableDeliveries.length} available deliveries with population`);
      
      res.json({
        success: true,
        deliveries: availableDeliveries,
        debug: {
          totalCount,
          statusCounts,
          upcomingCount,
          nullDriverCount,
          noDriverFieldCount,
          queryWithoutPopulateCount: queryWithoutPopulate.length
        }
      });
    } catch (error) {
      console.error('Error fetching available deliveries:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching available deliveries',
        error: error.message,
        stack: error.stack
      });
    }
  },

  getActiveDelivery: async (req, res) => {
    try {
      // More robust driver ID extraction
      const driverId = req.user?.id || req.user?._id || req.driver?._id || req.driver?.id;
      
      console.log('Fetching active delivery for driver:', driverId);
      console.log('Driver ID type:', typeof driverId);
      
      if (!driverId) {
        return res.status(401).json({
          success: false,
          message: 'Driver not authenticated'
        });
      }
  
      // Try both string and ObjectId formats
      const activeDelivery = await Delivery.findOne({
        $or: [
          { driverId: driverId },
          { driverId: driverId.toString() }
        ],
        status: { $in: ['accepted', 'in-transit'] }
      })
      .populate('senderId', 'fullName email phone');
  
      // Debug logging
      console.log('Active delivery found:', !!activeDelivery);
      if (activeDelivery) {
        console.log('Delivery status:', activeDelivery.status);
        console.log('Delivery driverId:', activeDelivery.driverId);
      }
  
      if (!activeDelivery) {
        return res.json({
          success: true,
          delivery: null,
          message: 'No active delivery found'
        });
      }
  
      res.json({
        success: true,
        delivery: activeDelivery
      });
    } catch (error) {
      console.error('Error fetching active delivery:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching active delivery',
        error: error.message
      });
    }
  },

  acceptDelivery: async (req, res) => {
    try {
      const { deliveryId } = req.params;
      const driverId = req.user.id || req.driver._id;

      // Validate deliveryId parameter
      console.log('Raw deliveryId from params:', deliveryId);
      
      if (!isValidObjectId(deliveryId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid delivery ID format',
          receivedId: deliveryId
        });
      }

      console.log(`Driver ${driverId} attempting to accept delivery ${deliveryId}`);

      const existingActiveDelivery = await Delivery.findOne({
        driverId: driverId,
        status: { $in: ['accepted', 'in-transit'] }
      }).populate('senderId', 'fullName email phone');

      if (existingActiveDelivery) {
        return res.status(400).json({
          success: false,
          message: 'You already have an active delivery'
        });
      }

      const delivery = await Delivery.findOneAndUpdate(
        {
          _id: deliveryId,
          status: 'upcoming',
          $or: [
            { driverId: null },
            { driverId: { $exists: false } }
          ]
        },
        {
          driverId: driverId,
          status: 'accepted',
          acceptedAt: new Date()
        },
        { new: true }
      )
      .populate('senderId', 'fullName email phone');

      if (!delivery) {
        return res.status(400).json({
          success: false,
          message: 'Delivery not available or already accepted'
        });
      }

      await Driver.findByIdAndUpdate(driverId, {
        $inc: { totalDeliveries: 1 }
      });
      try {
        await NotificationService.notifyDeliveryAccepted(driverId, delivery);
      } catch (notificationError) {
        console.error('Failed to send delivery acceptance notification:', notificationError);
      }
      res.json({
        success: true,
        delivery: delivery,
        message: 'Delivery accepted successfully'
      });
    } catch (error) {
      console.error('Error accepting delivery:', error);
      res.status(500).json({
        success: false,
        message: 'Error accepting delivery',
        error: error.message
      });
    }
  },

  startDelivery: async (req, res) => {
    try {
      const { deliveryId } = req.params;
      const driverId = req.user.id || req.driver._id;

      // Validate and log deliveryId parameter
      console.log('Raw deliveryId from params:', deliveryId);
      console.log('Type of deliveryId:', typeof deliveryId);
      console.log('Is valid ObjectId:', isValidObjectId(deliveryId));
      
      if (!isValidObjectId(deliveryId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid delivery ID format',
          receivedId: deliveryId,
          debug: {
            rawParam: deliveryId,
            type: typeof deliveryId,
            isValid: isValidObjectId(deliveryId),
            allParams: req.params
          }
        });
      }

      const delivery = await Delivery.findOneAndUpdate(
        {
          _id: deliveryId,
          driverId: driverId,
          status: 'accepted'
        },
        {
          status: 'in-transit',
          startedAt: new Date()
        },
        { new: true }
      )
      .populate('senderId', 'fullName email phone');

      if (!delivery) {
        return res.status(400).json({
          success: false,
          message: 'Delivery not found or cannot be started'
        });
      }
      try {
        await NotificationService.notifyDeliveryStarted(driverId, delivery);
      } catch (notificationError) {
        console.error('Failed to send delivery start notification:', notificationError);
      }
      res.json({
        success: true,
        delivery: delivery,
        message: 'Delivery started successfully'
      });
    } catch (error) {
      console.error('Error starting delivery:', error);
      res.status(500).json({
        success: false,
        message: 'Error starting delivery',
        error: error.message,
        debug: {
          deliveryId: req.params.deliveryId,
          allParams: req.params
        }
      });
    }
  },

  completeDelivery: async (req, res) => {
    try {
      const { deliveryId } = req.params;
      const driverId = req.user.id || req.driver._id;

      // Validate deliveryId parameter
      console.log('Raw deliveryId from params:', deliveryId);
      
      if (!isValidObjectId(deliveryId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid delivery ID format',
          receivedId: deliveryId
        });
      }

      const delivery = await Delivery.findOneAndUpdate(
        {
          _id: deliveryId,
          driverId: driverId,
          status: 'in-transit'
        },
        {
          status: 'completed',
          completedAt: new Date()
        },
        { new: true }
      )
      .populate('senderId', 'fullName email phone');

      if (!delivery) {
        return res.status(400).json({
          success: false,
          message: 'Delivery not found or cannot be completed'
        });
      }
      try {
        // Calculate earning (you may need to adjust this based on your pricing logic)
        const earning = delivery.price || delivery.estimatedEarning || 0;
        await NotificationService.notifyDeliveryCompleted(driverId, delivery, earning);
        
        // Also notify about payment
        if (earning > 0) {
          await NotificationService.notifyPaymentSuccess(driverId, earning, 'delivery completion');
        }
      } catch (notificationError) {
        console.error('Failed to send delivery completion notifications:', notificationError);
      }

      res.json({
        success: true,
        delivery: delivery,
        message: 'Delivery completed successfully'
      });
    } catch (error) {
      console.error('Error completing delivery:', error);
      res.status(500).json({
        success: false,
        message: 'Error completing delivery',
        error: error.message
      });
    }
  },

  getDriverDeliveryHistory: async (req, res) => {
    try {
      const driverId = req.user.id || req.driver._id;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      const deliveries = await Delivery.find({
        driverId: driverId
      })
      .populate('senderId', 'fullName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

      const totalDeliveries = await Delivery.countDocuments({
        driverId: driverId
      });

      res.json({
        success: true,
        deliveries: deliveries,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalDeliveries / limit),
          totalDeliveries: totalDeliveries
        }
      });
    } catch (error) {
      console.error('Error fetching delivery history:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching delivery history',
        error: error.message
      });
    }
  },

  checkAcceptanceStatus: async (req, res) => {
    try {
      const { deliveryId } = req.params;
      const driverId = req.user?.id || req.user?._id || req.driver?._id || req.driver?.id;
      
      console.log('=== CHECKING ACCEPTANCE STATUS ===');
      console.log('Raw deliveryId from params:', deliveryId);
      console.log('DriverId:', driverId);
      
      // Validate deliveryId parameter
      if (!isValidObjectId(deliveryId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid delivery ID format',
          receivedId: deliveryId,
          debug: {
            rawParam: deliveryId,
            type: typeof deliveryId,
            allParams: req.params
          }
        });
      }
      
      // Find the specific delivery
      const delivery = await Delivery.findById(deliveryId);
      
      if (!delivery) {
        return res.status(404).json({
          success: false,
          message: 'Delivery not found'
        });
      }
      
      console.log('Delivery found:', JSON.stringify(delivery, null, 2));
      console.log('Delivery driverId:', delivery.driverId);
      console.log('Delivery driverId type:', typeof delivery.driverId);
      console.log('Expected driverId:', driverId);
      console.log('Expected driverId type:', typeof driverId);
      console.log('IDs match (===):', delivery.driverId === driverId);
      console.log('IDs match (string comparison):', delivery.driverId?.toString() === driverId?.toString());
      
      res.json({
        success: true,
        delivery,
        debug: {
          deliveryDriverId: delivery.driverId,
          deliveryDriverIdType: typeof delivery.driverId,
          expectedDriverId: driverId,
          expectedDriverIdType: typeof driverId,
          idsMatch: delivery.driverId?.toString() === driverId?.toString(),
          status: delivery.status
        }
      });
    } catch (error) {
      console.error('Error checking acceptance status:', error);
      res.status(500).json({
        success: false,
        message: 'Error checking acceptance status',
        error: error.message
      });
    }
  },

  getActiveDeliveryDebug: async (req, res) => {
    try {
      console.log('=== DEBUGGING GET ACTIVE DELIVERY ===');
      
      // Debug authentication data
      console.log('req.user:', req.user);
      console.log('req.driver:', req.driver);
      
      // Extract driver ID with multiple fallbacks
      const driverId = req.user?.id || req.user?._id || req.driver?._id || req.driver?.id;
      console.log('Extracted driverId:', driverId);
      console.log('Type of driverId:', typeof driverId);
      
      if (!driverId) {
        return res.status(401).json({
          success: false,
          message: 'No driver ID found in request',
          debug: {
            user: req.user,
            driver: req.driver
          }
        });
      }

      // Step 1: Check if driver exists in database
      const driverExists = await Driver.findById(driverId);
      console.log('Driver exists:', !!driverExists);
      
      // Step 2: Find ALL deliveries for this driver
      const allDriverDeliveries = await Delivery.find({ driverId: driverId });
      console.log(`Total deliveries for driver: ${allDriverDeliveries.length}`);
      
      // Step 3: Check deliveries by status for this driver
      const deliveriesByStatus = await Delivery.aggregate([
        { $match: { driverId: new mongoose.Types.ObjectId(driverId) } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]);
      console.log('Driver deliveries by status:', deliveriesByStatus);
      
      // Step 4: Try different query variations
      console.log('--- Testing different query variations ---');
      
      // Query 1: Exact match with string conversion
      const query1 = await Delivery.find({
        driverId: driverId.toString(),
        status: { $in: ['accepted', 'in-transit'] }
      });
      console.log(`Query 1 (string driverId): ${query1.length} results`);
      
      // Query 2: Exact match with ObjectId conversion
      const query2 = await Delivery.find({
        driverId: new mongoose.Types.ObjectId(driverId),
        status: { $in: ['accepted', 'in-transit'] }
      });
      console.log(`Query 2 (ObjectId driverId): ${query2.length} results`);
      
      // Query 3: Just by driverId (any status)
      const query3 = await Delivery.find({ driverId: driverId });
      console.log(`Query 3 (any status): ${query3.length} results`);
      if (query3.length > 0) {
        console.log('Sample delivery:', JSON.stringify(query3[0], null, 2));
      }
      
      // Query 4: Check for 'accepted' status specifically
      const acceptedDeliveries = await Delivery.find({
        driverId: driverId,
        status: 'accepted'
      });
      console.log(`Accepted deliveries: ${acceptedDeliveries.length}`);
      
      // Query 5: Check for 'in-transit' status specifically
      const inTransitDeliveries = await Delivery.find({
        driverId: driverId,
        status: 'in-transit'
      });
      console.log(`In-transit deliveries: ${inTransitDeliveries.length}`);
      
      // Original query (this is what's failing)
      const activeDelivery = await Delivery.findOne({
        driverId: driverId,
        status: { $in: ['accepted', 'in-transit'] }
      })
      .populate('senderId', 'name email phone');

      console.log('Active delivery found:', !!activeDelivery);
      if (activeDelivery) {
        console.log('Active delivery details:', JSON.stringify(activeDelivery, null, 2));
      }

      res.json({
        success: true,
        delivery: activeDelivery,
        debug: {
          driverId,
          driverIdType: typeof driverId,
          driverExists: !!driverExists,
          totalDriverDeliveries: allDriverDeliveries.length,
          deliveriesByStatus,
          queryResults: {
            stringDriverId: query1.length,
            objectIdDriverId: query2.length,
            anyStatus: query3.length,
            acceptedOnly: acceptedDeliveries.length,
            inTransitOnly: inTransitDeliveries.length
          },
          sampleDelivery: query3.length > 0 ? query3[0] : null
        }
      });
    } catch (error) {
      console.error('Error in debug active delivery:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching active delivery',
        error: error.message,
        stack: error.stack
      });
    }
  },

  testDeliveryQuery: async (req, res) => {
    try {
      console.log('Testing delivery queries...');
      
      const allDeliveries = await Delivery.find({}).limit(5);
      console.log(`Total deliveries found: ${allDeliveries.length}`);
      
      const availableCount = await Delivery.countDocuments({
        status: 'upcoming',
        $or: [
          { driverId: null },
          { driverId: { $exists: false } }
        ]
      });
      
      console.log(`Available deliveries: ${availableCount}`);
      
      res.json({
        success: true,
        message: 'Delivery queries working',
        data: {
          totalDeliveries: allDeliveries.length,
          availableDeliveries: availableCount,
          sampleDeliveries: allDeliveries.map(d => ({
            id: d._id,
            status: d.status,
            driverId: d.driverId
          }))
        }
      });
    } catch (error) {
      console.error('Error in test query:', error);
      res.status(500).json({
        success: false,
        message: 'Error in test query',
        error: error.message
      });
    }
  }
};

module.exports = deliveryController;