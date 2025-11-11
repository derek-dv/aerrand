const mongoose = require('mongoose');

const WalletSchema = new mongoose.Schema({
  driverId: mongoose.Schema.Types.ObjectId,
  balance: { type: Number, default: 0 },
  earnings: [{ amount: Number, source: String, date: Date }]
});

module.exports = mongoose.model('Wallet', WalletSchema);