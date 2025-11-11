const axios = require('axios');

const optimizeRoute = async (driverId, stops) => {
  const formattedStops = stops.map((stop, index) => ({
    orderId: `stop-${index + 1}`,
    address: stop.address,
    location: {
      lat: stop.lat, //latitude
      lng: stop.lng, //longitude
    },
    timeWindowStart: stop.timeWindowStart,
    timeWindowEnd: stop.timeWindowEnd,
    serviceTime: 300 //5mins stop duration, thats on period!
  }));

  const payload = {
    apiKey: process.env.OPTIMOROUTE_API_KEY,
    orders: formattedStops,
    drivers: [
      {
        id: driverId.toString(),
        startLocation: {
          lat: stops[0].lat,
          lng: stops[0].lng
        },
        endLocation: {
          lat: stops[stops.length - 1].lat,
          lng: stops[stops.length - 1].lng
        }
      }
    ]
  };

  const response = await axios.post(`${process.env.OPTIMOROUTE_URL}/plan`, payload);
  return response.data;
};

module.exports = { optimizeRoute };
