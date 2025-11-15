const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SenderReceiver",
      required: true,
    },
    message: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    messageType: {
      type: String,
      enum: ["text", "image"],
      default: "text",
    },
    imageUrl: { type: String },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: { type: Date },
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: { type: Date },
  },
  { timestamps: true }
);

const chatSchema = new mongoose.Schema(
  {
    participants: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: (doc) => doc.role === "driver" ? "Driver" : "SenderReceiver",
          required: true,
        },
        role: {
          type: String,
          enum: ["customer", "driver"],
          required: true,
        },
        joinedAt: { type: Date, default: Date.now },
      },
    ],

    deliveryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Delivery",
    },

    chatType: {
      type: String,
      enum: ["delivery_related", "general_inquiry"],
      default: "delivery_related",
    },

    title: { type: String, maxlength: 100 },

    messages: [messageSchema],

    lastMessage: {
      senderId: { type: mongoose.Schema.Types.ObjectId, ref: "SenderReceiver" },
      message: String,
      imageUrl: String,
      timestamp: Date,
    },

    status: {
      type: String,
      enum: ["active", "archived", "closed"],
      default: "active",
    },

    unreadCounts: {
      type: Map,
      of: Number,
      default: {},
    },

    metadata: {
      createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SenderReceiver",
      },
      closedBy: { type: mongoose.Schema.Types.ObjectId, ref: "SenderReceiver" },
      closedAt: Date,
      archivedAt: Date,
    },
  },
  { timestamps: true }
);

// Indexes
chatSchema.index({ "participants.userId": 1 });
chatSchema.index({ deliveryId: 1 });
chatSchema.index({ status: 1 });
chatSchema.index({ "lastMessage.timestamp": -1 });
chatSchema.index({ createdAt: -1 });

// Virtual
chatSchema.virtual("messageCount").get(function () {
  return this.messages.length;
});

// Methods
chatSchema.methods.addMessage = function (
  senderId,
  message,
  messageType = "text",
  imageUrl = null
) {
  const newMessage = {
    senderId,
    message,
    messageType,
    imageUrl,
    isRead: false,
  };
  this.messages.push(newMessage);

  this.lastMessage = {
    senderId,
    message: messageType === "text" ? message : null,
    imageUrl: messageType === "image" ? imageUrl : null,
    timestamp: new Date(),
  };

  this.participants.forEach((participant) => {
    const participantId = participant.userId.toString();
    if (participantId !== senderId.toString()) {
      const currentCount = this.unreadCounts.get(participantId) || 0;
      this.unreadCounts.set(participantId, currentCount + 1);
    }
  });

  return this.messages[this.messages.length - 1];
};

chatSchema.methods.markMessagesAsRead = function (userId, messageIds = []) {
  const now = new Date();
  const userIdStr = userId.toString();

  if (messageIds.length === 0) {
    this.messages.forEach((msg) => {
      if (msg.senderId.toString() !== userIdStr && !msg.isRead) {
        msg.isRead = true;
        msg.readAt = now;
      }
    });
  } else {
    this.messages.forEach((msg) => {
      if (
        messageIds.includes(msg._id.toString()) &&
        msg.senderId.toString() !== userIdStr &&
        !msg.isRead
      ) {
        msg.isRead = true;
        msg.readAt = now;
      }
    });
  }
  this.unreadCounts.set(userIdStr, 0);
};

chatSchema.methods.getUnreadCount = function (userId) {
  return this.unreadCounts.get(userId.toString()) || 0;
};

chatSchema.methods.isParticipant = function (userId) {
  console.log(this.participants);
  return this.participants.some(
    (p) =>
      (p.userId._id ? p.userId._id.toString() : p.userId.toString()) ===
      userId.toString()
  );
};

chatSchema.methods.getOtherParticipants = function (userId) {
  return this.participants.filter(
    (p) =>
      (p.userId._id ? p.userId._id.toString() : p.userId.toString()) !==
      userId.toString()
  );
};

// Static methods
chatSchema.statics.createOrFindChat = async function (
  user1Id,
  user2Id,
  deliveryId = null,
  chatType = "delivery_related"
) {
  const existingChat = await this.findOne({
    $and: [
      { "participants.userId": user1Id },
      { "participants.userId": user2Id },
    ],
    deliveryId,
    status: "active",
  }).populate("participants.userId", "fullName email profilePhoto role");

  if (existingChat) return existingChat;
  console.log("No existing chat found, creating new chat.");

  // const User = mongoose.model("SenderReceiver");
  const Sender = require("./senderReceiver");
  const Driver = require("./Driver");

  // Removed the unused Promise.all which attempted to set user1/user2 and caused
  // a redeclaration error; use getUser below to resolve sender/driver per ID.

  const driver = await Driver.findById(user1Id).select("name");
  const sender = await Sender.findById(user2Id).select("fullName role");
  if (!driver && !sender)
    throw new Error(`One or both users not found`);
  // const getUser = async (userId) => {
  //   const sender = await Sender.findById(userId).select("fullName role");
  //   if (sender) return { user: sender, role: sender.role };
  //   const driver = await Driver.findById(userId).select("fullName role");
  //   if (driver) return { user: driver, role: driver.role };
  //   throw new Error(`User not found for ${userId}`);
  // };

  // const { user: user1, role: role1 } = await getUser(user1Id);
  // const { user: user2, role: role2 } = await getUser(user2Id);

  // if (!user1 || !user2) throw new Error("One or both users not found");

  const unreadCounts = new Map();
  unreadCounts.set(user1Id.toString(), 0);
  unreadCounts.set(user2Id.toString(), 0);
  console.log("Creating new chat between:", driver, "and", sender);

  console.log()

  const newChat = new this({
    participants: [
      { userId: user1Id, role: "driver" },
      { userId: user2Id, role: "customer" },
    ],
    deliveryId,
    chatType,
    title: deliveryId ? "Delivery Discussion" : "General Inquiry",
    unreadCounts,
    metadata: { createdBy: user1Id },
  });

  await newChat.save();
  await newChat.populate(
    "participants.userId",
    "fullName email profilePhoto role"
  );

  console.log(newChat)

  return newChat;
};

chatSchema.statics.findForUser = function (
  userId,
  { status = "active", limit = 20, skip = 0, includeArchived = false } = {}
) {
  const query = { "participants.userId": userId };
  if (!includeArchived) query.status = status;

  return this.find(query)
    .populate("participants.userId", "fullName phoneNumber email profilePhoto")
    .populate("deliveryId", "pickupLocation dropoffLocation status")
    .populate("lastMessage.senderId", "fullName phoneNumber")
    .sort({ "lastMessage.timestamp": -1, updatedAt: -1 })
    .limit(limit)
    .skip(skip);
};

chatSchema.methods.toJSON = function () {
  const chat = this.toObject();
  if (chat.unreadCounts)
    chat.unreadCounts = Object.fromEntries(chat.unreadCounts);
  return chat;
};

module.exports = mongoose.model("Chat", chatSchema);
