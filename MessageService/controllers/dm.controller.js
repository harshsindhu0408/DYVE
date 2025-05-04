import { Message } from "../models/message.model.js";
import { DMConversation } from "../models/dm.model.js";
import { getIO } from "../services/socket.js";
import {
  sendErrorResponse,
  sendSuccessResponse,
} from "../Utils/responseUtils.js";
import { getUsersForDmList } from "../services/dmVisibility.service.js";
import { redis } from "../services/redis.js";

// Start or continue a DM conversation
export const startDM = async (req, res) => {
  const userId = req.user._id;
  const { recipientId, recipientDisplay, userDisplay } = req.body;

  try {
    // Check if conversation already exists
    let conversation = await DMConversation.findOne({
      "participants.userId": { $all: [userId, recipientId] },
    });

    if (!conversation) {
      conversation = new DMConversation({
        participants: [
          {
            userId: userId,
            userDisplay: userDisplay,
            joinedAt: new Date(),
            isActive: true,
          },
          {
            userId: recipientId,
            userDisplay: recipientDisplay,
            joinedAt: new Date(),
            isActive: true,
          },
        ],
        participantIds: [userId, recipientId],
      });
      await conversation.save();
    } else {
      const now = new Date();
      conversation.participants = conversation.participants.map(
        (participant) => {
          if ([userId, recipientId].includes(participant.userId.toString())) {
            return {
              ...participant.toObject(),
              userDisplay: participant.userId.equals(userId)
                ? userDisplay
                : recipientDisplay,
              leftAt: null,
              isActive: true,
            };
          }
          return participant;
        }
      );
      await conversation.save();
    }

    return sendSuccessResponse(
      res,
      200,
      "DM_STARTED",
      "DM conversation started successfully",
      conversation,
      "startDM"
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      "DM_START_FAILED",
      "Error starting DM conversation",
      error.message
    );
  }
};

// Send a DM
export const sendDM = async (req, res) => {
  const userId = req.user._id;
  const { conversationId, content, senderDisplay } = req.body;

  try {
    const conversation = await DMConversation.findOne({
      _id: conversationId,
      "participants.userId": userId,
      "participants.isActive": true,
    });

    if (!conversation) {
      return sendErrorResponse(
        res,
        403,
        "DM_SEND_UNAUTHORIZED",
        "Not part of this conversation or conversation inactive",
        null
      );
    }

    const message = new Message({
      dmConversationId: conversationId,
      senderId: userId,
      senderDisplay: senderDisplay,
      content,
    });

    await message.save();

    // Update conversation last message
    conversation.lastMessageAt = new Date();
    conversation.lastMessageId = message._id;
    await conversation.save();

    // Emit to active participants only
    const io = getIO();
    conversation.participants
      .filter((p) => p.isActive)
      .forEach((participant) => {
        io.to(`user-${participant.userId}`).emit("new-dm", message);
      });
    io.to(`dm-${conversationId}`).emit("message", message);

    return sendSuccessResponse(
      res,
      201,
      "DM_SENT",
      "Message sent successfully",
      message,
      "sendDM"
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      "DM_SEND_FAILED",
      "Error sending message",
      error.message
    );
  }
};

// Get all DM conversations for a user
export const getMyConversations = async (req, res) => {
  const userId = req.user._id;

  try {
    const conversations = await DMConversation.find({
      "participants.userId": userId,
      "participants.isActive": true,
    })
      .sort({ lastMessageAt: -1 })
      .populate("lastMessageId");

    return sendSuccessResponse(
      res,
      200,
      "DM_CONVERSATIONS_FETCHED",
      "Conversations fetched successfully",
      conversations,
      "getMyConversations",
      conversations.length
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      "DM_CONVERSATIONS_FETCH_FAILED",
      "Error fetching conversations",
      error.message
    );
  }
};

// Get messages in a DM conversation
export const getDMMessages = async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user._id;

  try {
    const conversation = await DMConversation.findOne({
      _id: conversationId,
      "participants.userId": userId,
      "participants.isActive": true,
    });

    if (!conversation) {
      return sendErrorResponse(
        res,
        403,
        "DM_MESSAGES_UNAUTHORIZED",
        "Not part of this conversation or conversation inactive",
        null
      );
    }

    const messages = await Message.find({ dmConversationId: conversationId })
      .sort({ createdAt: -1 })
      .limit(50);

    return sendSuccessResponse(
      res,
      200,
      "DM_MESSAGES_FETCHED",
      "Messages fetched successfully",
      messages.reverse(),
      "getDMMessages",
      messages.length
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      "DM_MESSAGES_FETCH_FAILED",
      "Error fetching messages",
      error.message
    );
  }
};

// Leave a DM conversation
export const leaveDM = async (req, res) => {
  const userId = req.user._id;
  const { conversationId } = req.params;

  try {
    const conversation = await DMConversation.findOneAndUpdate(
      {
        _id: conversationId,
        "participants.userId": userId,
      },
      {
        $set: {
          "participants.$.leftAt": new Date(),
          "participants.$.isActive": false,
        },
      },
      { new: true }
    );

    if (!conversation) {
      return sendErrorResponse(
        res,
        404,
        "DM_NOT_FOUND",
        "Conversation not found",
        null
      );
    }

    return sendSuccessResponse(
      res,
      200,
      "DM_LEFT",
      "Left conversation successfully",
      null,
      "leaveDM"
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      "DM_LEAVE_FAILED",
      "Error leaving conversation",
      error.message
    );
  }
};

export const getVisibleDMUsers = async (req, res) => {
  const userId = req.user._id;
  const workspaceId = req.params.workspaceId;

  try {
    // Get users with timeout protection
    const users = await withTimeout(
      getUsersForDmList(userId, workspaceId),
      4000 // 4 second overall timeout
    );

    return sendSuccessResponse(
      res,
      200,
      "DM_USERS_FETCHED",
      "Visible DM users fetched successfully",
      users,
      "getVisibleDMUsers",
      users.length
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      "DM_USERS_FETCH_FAILED",
      "Error fetching visible DM users",
      error.message
    );
  }
};

// utils.js
export const withTimeout = (promise, ms) => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Operation timed out after ${ms}ms`));
    }, ms);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
};
