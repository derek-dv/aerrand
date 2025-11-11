// debug-connection.js - Check which database you're actually connected to
const mongoose = require('mongoose');
require('dotenv').config();

async function debugConnection() {
  try {
    console.log('=== DATABASE CONNECTION DEBUG ===');
    console.log('MONGO_URI from .env:', process.env.MONGO_URI);
    
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✓ Connected to MongoDB');
    
    // Get connection info
    const db = mongoose.connection.db;
    console.log('Database name:', db.databaseName);
    
    // List all collections
    const collections = await db.listCollections().toArray();
    console.log('Available collections:', collections.map(c => c.name));
    
    // Check each collection that might contain deliveries
    const possibleCollections = ['deliveries', 'Deliveries', 'delivery', 'Delivery'];
    
    for (const collectionName of possibleCollections) {
      try {
        const count = await db.collection(collectionName).countDocuments();
        console.log(`Collection "${collectionName}": ${count} documents`);
        
        if (count > 0) {
          // Get sample documents
          const samples = await db.collection(collectionName).find().limit(2).toArray();
          console.log(`Sample documents from "${collectionName}":`, JSON.stringify(samples, null, 2));
        }
      } catch (error) {
        console.log(`Collection "${collectionName}": does not exist`);
      }
    }
    
    // Try the Delivery model
    console.log('\n=== TESTING MONGOOSE MODEL ===');
    const DeliveryModel = mongoose.model('Delivery', new mongoose.Schema({}, { strict: false }));
    const modelCount = await DeliveryModel.countDocuments();
    console.log('Mongoose Delivery model count:', modelCount);
    
    if (modelCount > 0) {
      const samples = await DeliveryModel.find().limit(2);
      console.log('Sample from Mongoose model:', JSON.stringify(samples, null, 2));
    }
    
    // Check if there are documents in any collection
    let totalDocs = 0;
    for (const collection of collections) {
      const count = await db.collection(collection.name).countDocuments();
      totalDocs += count;
      if (count > 0) {
        console.log(`\nFound ${count} documents in collection "${collection.name}"`);
        const sample = await db.collection(collection.name).findOne();
        console.log('Sample document:', JSON.stringify(sample, null, 2));
      }
    }
    
    console.log(`\nTotal documents across all collections: ${totalDocs}`);
    
  } catch (error) {
    console.error('Debug failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nConnection closed');
  }
}

// Run the debug
debugConnection();
