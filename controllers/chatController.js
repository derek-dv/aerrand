const Chat = require('../models/Chat');
const mongoose = require('mongoose');

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const chatController = {

  // Create or get a chat between two users
  getOrCreateChat: async (req, res) => {
    try {
      console.log(req.user);
      const user1Id = req.user.id; // logged-in user
      const { user2Id, deliveryId, chatType="delivery_related" } = req.body;
      console.log('getOrCreateChat called with:', { user1Id, user2Id, deliveryId, chatType });

      if (!isValidObjectId(user1Id))
        return res.status(400).json({ success: false, message: 'Invalid user1Id' });

      if (!isValidObjectId(user2Id))
        return res.status(400).json({ success: false, message: 'Invalid user2Id' });

      const chat = await Chat.createOrFindChat(user1Id, user2Id, deliveryId, chatType);
      res.json({ success: true, chat });
    } catch (error) {
      console.error('Error in getOrCreateChat:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Send a message in a chat
  sendMessage: async (req, res) => {
    try {
      const userId = req.user.id;
      const { chatId, message, messageType, imageUrl } = req.body;

      if (!isValidObjectId(chatId))
        return res.status(400).json({ success: false, message: 'Invalid chatId' });

      const chat = await Chat.findById(chatId);
      if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });

      if (!chat.isParticipant(userId))
        return res.status(403).json({ success: false, message: 'You are not a participant' });

      const newMessage = chat.addMessage(userId, message, messageType, imageUrl);
      await chat.save();
      await chat.populate('participants.userId', 'fullName email profilePhoto role');

      res.json({ success: true, message: newMessage, chat });
    } catch (error) {
      console.error('Error sending message:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Get messages for a chat
  getChatMessages: async (req, res) => {
    try {
      const userId = req.user.id;
      const { chatId } = req.params;

      if (!isValidObjectId(chatId))
        return res.status(400).json({ success: false, message: 'Invalid chatId' });

      const chat = await Chat.findById(chatId)
        // .populate('participants.userId', 'fullName email profilePhoto role')
        // .populate('messages.senderId', 'fullName email profilePhoto role');

      if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });

      if (!chat.isParticipant(userId))
        return res.status(403).json({ success: false, message: 'You are not a participant' });

      res.json({ success: true, messages: chat.messages, chat });
    } catch (error) {
      console.error('Error fetching chat messages:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Mark messages as read
  markMessagesRead: async (req, res) => {
    try {
      const userId = req.user.id;
      const { chatId, messageIds } = req.body;

      if (!isValidObjectId(chatId))
        return res.status(400).json({ success: false, message: 'Invalid chatId' });

      const chat = await Chat.findById(chatId);
      if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });

      if (!chat.isParticipant(userId))
        return res.status(403).json({ success: false, message: 'You are not a participant' });

      chat.markMessagesAsRead(userId, messageIds || []);
      await chat.save();

      res.json({ success: true, message: 'Messages marked as read', chat });
    } catch (error) {
      console.error('Error marking messages as read:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Get all chats for a user
  getUserChats: async (req, res) => {
    try {
      const userId = req.user.id;
      const { status, limit, skip, includeArchived } = req.query;

      const chats = await Chat.findForUser(userId, {
        status: status || 'active',
        limit: parseInt(limit) || 20,
        skip: parseInt(skip) || 0,
        includeArchived: includeArchived === 'true'
      });

      res.json({ success: true, chats });
    } catch (error) {
      console.error('Error fetching user chats:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

};

module.exports = chatController;
