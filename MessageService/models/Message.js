const mongoose = require('mongoose');

const reactionSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  emoji: String,
  createdAt: { type: Date, default: Date.now },
});

const messageSchema = new mongoose.Schema({
  channelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', default: null },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  content: String,
  reactions: [reactionSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Message', messageSchema);
