// walletController.js 
const Wallet = require('../models/Wallet');

exports.getEarnings = async (req, res) => {
  const wallet = await Wallet.findOne({ driverId: req.user._id });
  res.json(wallet);
};

exports.receiveTip = async (req, res) => {
  const { driverId } = req.params;
  const { amount } = req.body;
  await Wallet.findOneAndUpdate(
    { driverId },
    { $inc: { balance: amount }, $push: { earnings: { amount, source: 'tip', date: new Date() } } },
    { upsert: true }
  );
  res.json({ message: 'Tip received' });
};