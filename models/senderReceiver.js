const mongoose = require("mongoose");

const placeSchema = new mongoose.Schema(
  {
    label: String,
    address: String,
    coordinates: {
      lat: Number,
      lng: Number,
    },
  },
  { _id: true } // ensures _id is generated
);

const senderReceiverSchema = new mongoose.Schema({
  authProvider: {
    type: String,
    enum: ["phone", "google", "apple"],
    required: true,
  },
  phoneNumber: {
    type: String,
    required: function () {
      return this.authProvider === "phone";
    },
    unique: true,
    sparse: true,
  },
  email: {
    type: String,
    unique: true,
    sparse: true,
  },
  googleId: { type: String, sparse: true },
  appleId: { type: String, sparse: true },

  fullName: { type: String, required: true, trim: true },
  profilePhoto: String,

  // ✅ Role for chat (required)
  role: {
    type: String,
    enum: ["customer", "driver", "admin"],
    default: "customer",
    required: true,
  },

  currentLocation: {
    lat: Number,
    lng: Number,
  },

  deliveryHistory: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Delivery",
    },
  ],

  savedPlaces: {
    home: { type: placeSchema, default: undefined },
    work: { type: placeSchema, default: undefined },
    custom: { type: placeSchema, default: undefined },
  },

  wallet: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Wallet",
  },

  notifications: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Notification",
    },
  ],

  settings: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Settings",
  },
  onesignalPlayerId: { type: String, default: null },
  giftCards: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GiftCard",
    },
  ],

  chats: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
    },
  ],

  status: {
    type: String,
    enum: ["online", "offline", "away", "busy"],
    default: "offline",
  },
  lastSeen: { type: Date, default: Date.now },

  socketId: { type: String, default: null },

  tokenVersion: {
    type: Number,
    default: 0,
  },

  isVerified: { type: Boolean, default: false },
  isBlocked: { type: Boolean, default: false },
  deleted: { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now },
  lastLogin: Date,
});

module.exports = mongoose.model("SenderReceiver", senderReceiverSchema);
