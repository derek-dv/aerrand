// driverController.js
const Driver = require('../models/Driver');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { NotificationService } = require('../services/NotificationService');
exports.register = async (req, res) => {
  const { name, email, phone, password } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  const driver = await Driver.create({ name, email, phone, password: hashed });
  res.json(driver);
};

exports.uploadLicense = async (req, res) => {
  try {
    const { licenseUrl } = req.body;
    await Driver.findByIdAndUpdate(req.user.id, { licenseUrl }); // Fixed: use req.user.id
    try {
      await NotificationService.notifyDocumentUploaded(req.user.id, 'driversLicense');
    } catch (notificationError) {
      console.error('Failed to send license upload notification:', notificationError);
    }
    res.json({ message: 'License uploaded' });
  } catch (error) {
    console.error('Upload license error:', error);
    res.status(500).json({ message: 'Failed to upload license', error: error.message });
  }
};

exports.verifyIdentity = async (req, res) => {
  try {
    await Driver.findByIdAndUpdate(req.user.id, { verified: true }); // Fixed: use req.user.id
    try {
      await NotificationService.notifyVerificationApproved(req.user.id);
    } catch (notificationError) {
      console.error('Failed to send verification notification:', notificationError);
    }
    
    res.json({ message: 'Identity verified' });
  } catch (error) {
    console.error('Verify identity error:', error);
    res.status(500).json({ message: 'Failed to verify identity', error: error.message });
  }
};

exports.getProfile = async (req, res) => {
  try {
    // Option 1: Use the driver already fetched by middleware
    if (req.driver) {
      const driverResponse = req.driver.toObject();
      delete driverResponse.password; // Remove password from response
      return res.json(driverResponse);
    }
    
    // Option 2: Fetch driver using correct property
    const driver = await Driver.findById(req.user.id); // Fixed: use req.user.id
    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }
    
    const driverResponse = driver.toObject();
    delete driverResponse.password; // Remove password from response
    res.json(driverResponse);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Failed to get profile', error: error.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const driver = await Driver.findByIdAndUpdate(req.user.id, req.body, { new: true }); // Fixed: use req.user.id
    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }
    
    const driverResponse = driver.toObject();
    delete driverResponse.password; // Remove password from response
    try {
      const updatedFields = Object.keys(req.body);
      await NotificationService.notifyProfileUpdated(req.user.id, updatedFields);
    } catch (notificationError) {
      console.error('Failed to send profile update notification:', notificationError);
    }
    res.json(driverResponse);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Failed to update profile', error: error.message });
  }
};

exports.setAvailability = async (req, res) => {
  try {
    const { available } = req.body;
    const driver = await Driver.findByIdAndUpdate(req.user.id, { available }, { new: true }); // Fixed: use req.user.id
    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }
    try {
      const statusText = driver.available ? 'online and ready for deliveries' : 'offline';
      await NotificationService.createNotification(
        req.user.id,
        'general',
        'Availability Updated',
        `You are now ${statusText}.`,
        { available: driver.available },
        { priority: 'low' }
      );
    } catch (notificationError) {
      console.error('Failed to send availability notification:', notificationError);
    }
    
    res.json({ message: 'Availability updated', available: driver.available });
  } catch (error) {
    console.error('Set availability error:', error);
    res.status(500).json({ message: 'Failed to update availability', error: error.message });
  }
};

exports.getStatus = async (req, res) => {
  try {
    // Use driver from middleware if available
    if (req.driver) {
      return res.json({ available: req.driver.available });
    }
    
    const driver = await Driver.findById(req.user.id); // Fixed: use req.user.id
    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }
    
    res.json({ available: driver.available });
  } catch (error) {
    console.error('Get status error:', error);
    res.status(500).json({ message: 'Failed to get status', error: error.message });
  }
};

exports.updateLocation = async (req, res) => {
  try {
    const { lat, lng } = req.body;
    
    if (!lat || !lng) {
      return res.status(400).json({ message: 'Latitude and longitude are required' });
    }
    
    const driver = await Driver.findByIdAndUpdate(
      req.user.id, // Fixed: use req.user.id
      { location: { type: 'Point', coordinates: [lng, lat] } },
      { new: true }
    );
    
    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }
    
    res.json({ message: 'Location updated', location: driver.location });
  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({ message: 'Failed to update location', error: error.message });
  }
};