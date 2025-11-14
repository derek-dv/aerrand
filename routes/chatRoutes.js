const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth'); 
const chatController = require('../controllers/chatController');

router.post('/create-or-get', authMiddleware, chatController.getOrCreateChat);

// Send a message in a chat
router.post('/send-message', authMiddleware,  chatController.sendMessage);

// Get messages for a specific chat
router.get('/:chatId/messages', authMiddleware, chatController.getChatMessages);

// Mark messages as read
router.post('/mark-read', authMiddleware, chatController.markMessagesRead);

// Get all chats for the logged-in user
router.get('/', authMiddleware, chatController.getUserChats);

module.exports = router;