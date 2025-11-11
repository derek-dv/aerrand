// migration-script.js - Run this once to clean up your data
const mongoose = require('mongoose');
require('dotenv').config();

async function migrateDriverIds() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB for migration');

    // Find all deliveries with empty string driverId
    const deliveriesWithEmptyDriverId = await mongoose.connection.db.collection('deliveries').find({
      driverId: ""
    }).toArray();

    console.log(`Found ${deliveriesWithEmptyDriverId.length} deliveries with empty driverId`);

    if (deliveriesWithEmptyDriverId.length > 0) {
      // Update them to have null instead of empty string
      const result = await mongoose.connection.db.collection('deliveries').updateMany(
        { driverId: "" },
        { $unset: { driverId: 1 } } // Remove the field entirely, or use $set: { driverId: null }
      );

      console.log(`Updated ${result.modifiedCount} deliveries`);
    }

    // Also check for any other problematic driverId values
    const allDeliveries = await mongoose.connection.db.collection('deliveries').find({}).toArray();
    console.log('Sample deliveries after migration:');
    allDeliveries.slice(0, 3).forEach((delivery, index) => {
      console.log(`Delivery ${index + 1}:`, {
        id: delivery._id,
        status: delivery.status,
        driverId: delivery.driverId,
        hasDriverId: delivery.hasOwnProperty('driverId'),
        driverIdType: typeof delivery.driverId
      });
    });

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Migration completed, connection closed');
  }
}

// Run the migration
migrateDriverIds();
