const Message = require('../models/Message');

// Send a new message
exports.createMessage = async (req, res) => {
  try {
    const { content } = req.body;
    const message = new Message({
      channelId: req.params.channelId,
      senderId: req.user.id,
      content,
    });
    await message.save();

    res.status(201).json(message);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
