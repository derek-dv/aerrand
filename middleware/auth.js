const jwt = require('jsonwebtoken');
const Driver = require('../models/Driver');

module.exports = async function(req, res, next) {
    try {
        const token = req.header('Authorization');
        
        if (!token) {
            return res.status(401).json({ msg: 'No token, authorization denied' });
        }

        // Extract token from "Bearer <token>" format
        const tokenValue = token.split(" ")[1];
        if (!tokenValue) {
            return res.status(401).json({ msg: 'Invalid token format' });
        }

        const decoded = jwt.verify(tokenValue, process.env.JWT_SECRET);
        
        // For complete registration route, we allow temporary tokens
        if (req.path === '/register/complete' && decoded.step === 'verified_phone') {
            req.user = decoded;
            return next();
        }

        // For all other routes, require full authentication
        if (!decoded.id || decoded.type !== 'driver') {
            return res.status(401).json({ msg: 'Invalid token' });
        }

        // Optional: Verify driver still exists in database
        const driver = await Driver.findById(decoded.id);
        if (!driver) {
            return res.status(401).json({ msg: 'Driver not found' });
        }

        req.user = decoded;
        req.driver = driver;
        next();
        
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(401).json({ msg: 'Token is not valid' });
    }
};