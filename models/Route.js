const mongoose = require('mongoose');

const StopSchema = new mongoose.Schema({
  address: String,
  lat: Number,
  lng: Number,
  timeWindowStart: String,
  timeWindowEnd: String,
  status: { type: String, enum: ['pending', 'completed'], default: 'pending' }
});

const RouteSchema = new mongoose.Schema({
  driverId: mongoose.Schema.Types.ObjectId,
  stops: [StopSchema]
}, { timestamps: true });

module.exports = mongoose.model('Route', RouteSchema);
