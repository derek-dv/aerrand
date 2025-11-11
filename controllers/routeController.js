const Route = require('../models/Route');
const { optimizeRoute } = require('../utils/optimoroute');

exports.assignOptimizedRoute = async (req, res) => {
  try {
    const { stops } = req.body;
    const driverId = req.user._id;

    const optimized = await optimizeRoute(driverId, stops);

    const optimizedStops = optimized.routes[0].orders.map(order => ({
      address: order.address,
      lat: order.location.lat,
      lng: order.location.lng,
      timeWindowStart: order.timeWindowStart,
      timeWindowEnd: order.timeWindowEnd,
      status: 'pending'
    }));

    const newRoute = await Route.create({
      driverId,
      stops: optimizedStops
    });

    res.status(201).json(newRoute);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to assign optimized route' });
  }
};

exports.getAssignedRoutes = async (req, res) => {
  try {
    const routes = await Route.find({ driverId: req.user._id });
    res.json(routes);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch routes' });
  }
};

exports.updateStopStatus = async (req, res) => {
  try {
    const { routeId } = req.params;
    const { stopIndex, status } = req.body;

    const route = await Route.findById(routeId);
    if (!route || !route.stops[stopIndex]) {
      return res.status(404).json({ error: 'Stop not found' });
    }

    route.stops[stopIndex].status = status;
    await route.save();

    res.json({ message: 'Stop status updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update stop status' });
  }
};

exports.getRouteSummary = async (req, res) => {
  try {
    const route = await Route.findById(req.params.routeId);
    if (!route) return res.status(404).json({ error: 'Route not found' });
    res.json(route);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get route summary' });
  }
};
