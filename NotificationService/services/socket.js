import { Server } from "socket.io";
import { socketAuthMiddlewareForNotification } from "../middlewares/authMiddleWare.js";
import mongoose from "mongoose";
import { verifyChannelMembership } from "./userAccess.js";
import { getChannelMembers } from "../helpers/helperFunctions.js";

let io = null;
let typingUsers = {};
const channelTypingUsers = {};
const activeDMViewers = {};

async function getParticipantsInRoom(roomId) {
  const sockets = await io.in(roomId).fetchSockets();
  return sockets.map((socket) => socket.user._id.toString());
}

export const initSocket = (server) => {
  console.log("✅ [Socket.io] Initialization started...");

  if (io) {
    console.log("[Socket.io] Already initialized, returning existing instance");
    return io;
  }

  try {
    io = new Server(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
      connectionStateRecovery: {
        maxDisconnectionDuration: 120000, // 2 minutes
      },
    });

    console.log("✅ [Socket.io] Server instance created");
    io.use(socketAuthMiddlewareForNotification);

    io.on("connection", (socket) => {
      console.log(`[Socket.io] New connection: ${socket.id}`);
      console.log(`[Socket.io] Total connections: ${io.engine.clientsCount}`);

      // User joins their personal room for notifications
      socket.on("register-user", async (userId) => {
        console.log(`[Socket.io] User ${userId} registering`);
        socket.userId = userId;
        socket.join(`user-${userId}`);

        const userObjectId = new mongoose.Types.ObjectId(userId);
        const dms = await DMConversation.find({
          "participants.userId": userObjectId,
        });

        dms.forEach((dm) => {
          socket.join(`dm-${dm._id}`);
          console.log(`Auto-joined user ${userId} to DM ${dm._id}`);
        });

        console.log(`[Socket.io] Rooms for ${socket.id}:`, socket.rooms);
      });

      socket.on("dm-opened", async ({ dmId, userId }) => {
        try {
          activeDMViewers[userId] = dmId;

          const updateResult = await DMConversation.updateOne(
            {
              _id: dmId,
              "participants.userId": new mongoose.Types.ObjectId(userId),
            },
            {
              $set: {
                "participants.$[elem].unreadCount": 0,
                "participants.$[elem].lastReadAt": new Date(),
              },
            },
            {
              arrayFilters: [
                { "elem.userId": new mongoose.Types.ObjectId(userId) },
              ],
            }
          );

          if (updateResult.modifiedCount === 0) {
            console.warn(
              `No participant found for user ${userId} in DM ${dmId}`
            );
            return;
          }

          // Notify all clients for this user
          io.to(`user-${userId}`).emit("dm-unread-updated", {
            dmId,
            unreadCount: 0,
          });

          // Send read receipt to other participants
          socket.to(`dm-${dmId}`).emit("dm-read-receipt", {
            dmId,
            userId,
            readAt: new Date(),
          });
        } catch (error) {
          console.error("Error in dm-opened:", error);
          socket.emit("dm-open-error", {
            error: "Failed to reset unread count",
            details: error.message,
          });
        }
      });

      socket.on("channel-viewed", async (channelId) => {
        try {
          const userId = socket.userId;
          
          const result = await ChannelMemberStatus.updateOne(
            { channelId, userId },
            { 
              $set: { 
                unreadCount: 0,
                lastReadAt: new Date()
              }
            }
          );
      
          if (result.modifiedCount > 0) {
            io.to(`user-${userId}`).emit("channel-unread-updated", {
              channelId,
              unreadCount: 0
            });
          }
        } catch (error) {
          console.error("Error updating channel read status:", error);
        }
      });

      socket.on("dm-closed", async ({ dmId, userId }) => {
        delete activeDMViewers[userId];
        try {

          const updateResult = await DMConversation.updateOne(
            {
              _id: dmId,
              "participants.userId": new mongoose.Types.ObjectId(userId),
            },
            {
              $set: {
                "participants.$[elem].unreadCount": 0,
                "participants.$[elem].lastReadAt": new Date(),
              },
            },
            {
              arrayFilters: [
                { "elem.userId": new mongoose.Types.ObjectId(userId) },
              ],
            }
          );

          if (updateResult.modifiedCount === 0) {
            console.warn(
              `No participant found for user ${userId} in DM ${dmId}`
            );
            return;
          }

          // Notify all clients for this user
          io.to(`user-${userId}`).emit("dm-unread-updated", {
            dmId,
            unreadCount: 0,
          });

          // Send read receipt to other participants
          socket.to(`dm-${dmId}`).emit("dm-read-receipt", {
            dmId,
            userId,
            readAt: new Date(),
          });
        } catch (error) {
          console.error("Error in dm-closing:", error);
          socket.emit("dm-close-error", {
            error: "Failed to reset unread count",
            details: error.message,
          });
        }
      });

      // Join a channel room
      socket.on("join-channel", async (channelId) => {
        try {
          const userId = socket.userId;
          console.log(
            `[Socket.io] User ${userId} joining channel ${channelId}`
          );

          // const userData = await verifyChannelMembership(userId, channelId);
          // if (!userData) {
          //   throw new Error("User not authorized to join this channel");
          // }

          socket.join(`channel-${channelId}`);

          const updatedStatus = await ChannelMemberStatus.updateOne(
            { channelId, userId },
            { $set: { unreadCount: 0, lastReadAt: new Date() } }
          );

          // Leave other channels when joining new one
          const currentRooms = Array.from(socket.rooms);
          currentRooms.forEach((room) => {
            if (
              room.startsWith("channel-") &&
              room !== `channel-${channelId}`
            ) {
              socket.leave(room);
            }
          });

          socket.emit("channel-joined", {
            channelId,
            // userData,
            unreadStatus: {
              unreadCount: updatedStatus.unreadCount,
              lastReadAt: updatedStatus.lastReadAt,
            },
          });
        } catch (error) {
          console.error("[Socket.io] Error joining channel:", error);
          socket.emit("channel-error", {
            error: "Failed to join channel",
            details: error.message,
            channelId,
          });
        }
      });

      // Join a DM conversation room
      socket.on("join-dm", async (dmId) => {
        try {
          const userId = socket.userId;

          console.log(`[Socket.io] User joining DM conversation ${dmId}`);

          // Convert to ObjectId first to ensure validity
          const userObjectId = new mongoose.Types.ObjectId(userId);
          const dmObjectId = new mongoose.Types.ObjectId(dmId);

          // First, verify the DM exists and user is a participant
          const dm = await DMConversation.findOne({
            _id: dmObjectId,
            "participants.userId": userObjectId,
          });

          if (!dm) {
            console.warn(
              `DM ${dmId} not found or user ${userId} not a participant`
            );
            return socket.emit("socket-error", {
              event: "join-dm",
              message: "DM not found or you're not a participant",
            });
          }

          socket.join(`dm-${dmId}`);
          console.log(`[Socket.io] Rooms for ${socket.id}:`, socket.rooms);

          const result = await DMConversation.updateOne(
            {
              _id: dmObjectId,
              "participants.userId": userObjectId,
            },
            {
              $set: {
                "participants.$.unreadCount": 0,
                "participants.$.lastReadAt": new Date(),
              },
            }
          );

          console.log("Update result:", result);

          if (result.modifiedCount === 0) {
            console.warn(
              `Failed to update unread count for user ${userId} in DM ${dmId}`
            );
          } else {
            socket.emit("dm-unread-updated", {
              dmId,
              userId,
              unreadCount: 0,
            });
            socket.to(`dm-${dmId}`).emit("dm-read-receipt", {
              dmId,
              userId,
              readAt: new Date(),
            });
          }
        } catch (error) {
          console.error("[Socket.io] Error joining DM:", error);
          socket.emit("socket-error", {
            event: "join-dm",
            message: "Failed to join DM conversation",
            error: error.message,
          });
        }
      });

      socket.on("typing-start", (data) => {
        const { dmId, userId } = data;
        if (!typingUsers[dmId]) {
          typingUsers[dmId] = new Set();
        }
        typingUsers[dmId].add(userId);

        // Broadcast to all other participants in the DM
        socket.to(`dm-${dmId}`).emit("user-typing", {
          dmId,
          userId,
          isTyping: true,
        });
      });

      socket.on("typing-stop", (data) => {
        const { dmId, userId } = data;
        if (typingUsers[dmId]) {
          typingUsers[dmId].delete(userId);

          // Broadcast to all other participants in the DM
          socket.to(`dm-${dmId}`).emit("user-typing", {
            dmId,
            userId,
            isTyping: false,
          });
        }
      });

      socket.on("channel-typing-start", (data) => {
        const { channelId, userId } = data;

        if (!channelTypingUsers[channelId]) {
          channelTypingUsers[channelId] = new Set();
        }

        channelTypingUsers[channelId].add(userId);

        socket.to(`channel-${channelId}`).emit("channel-user-typing", {
          channelId,
          typingUsers: Array.from(channelTypingUsers[channelId]),
        });
      });

      socket.on("channel-typing-stop", (data) => {
        const { channelId, userId } = data;

        if (channelTypingUsers[channelId]) {
          channelTypingUsers[channelId].delete(userId);

          socket.to(`channel-${channelId}`).emit("channel-user-typing", {
            channelId,
            typingUsers: Array.from(channelTypingUsers[channelId]),
          });
        }
      });

      socket.on("fetch-messages", async (data) => {
        try {
          const { dmId, limit = 50, before } = data;

          // Convert dmId to ObjectId if it's a string
          const conversationId = mongoose.Types.ObjectId.isValid(dmId)
            ? new mongoose.Types.ObjectId(dmId)
            : dmId;

          // Build the query
          const query = {
            dmConversationId: conversationId,
            deletedAt: { $exists: false },
          };

          // Add date filter if before timestamp is provided
          if (before) {
            query.createdAt = { $lt: new Date(before) };
          }

          // Fetch messages with proper sorting
          const messages = await Message.find(query)
            .sort({ createdAt: -1 }) // Get newest first (we'll reverse later)
            .limit(parseInt(limit))
            .lean();

          // Convert dates to ISO strings for client-side handling
          const processedMessages = messages.map((msg) => ({
            ...msg,
            createdAt: msg.createdAt.toISOString(),
            updatedAt: msg.updatedAt?.toISOString(),
          }));

          socket.emit("old-messages", {
            dmId,
            messages: processedMessages.reverse(), // Oldest first for display
            hasMore: messages.length === parseInt(limit),
          });
        } catch (error) {
          console.error("Error fetching messages:", error);
          socket.emit("message-error", {
            error: "Failed to fetch messages",
            details: error.message,
          });
        }
      });

      // Fetch channel messages
      socket.on("fetch-channel-messages", async (data) => {
        try {
          const { channelId, limit = 50, before } = data;

          // Verify membership with channel service
          // const isMember = await verifyChannelMembership(
          //   socket.userId,
          //   channelId
          // );

          // if (!isMember) {
          //   throw new Error(
          //     "User not authorized to view this channel's messages"
          //   );
          // }

          const query = {
            channelId,
            deletedAt: { $exists: false },
          };

          if (before) {
            query.createdAt = { $lt: new Date(before) };
          }

          const messages = await Message.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .lean();

          socket.emit("old-channel-messages", {
            channelId,
            messages: messages.reverse(),
            hasMore: messages.length === parseInt(limit),
          });
        } catch (error) {
          console.error("[Socket.io] Error fetching channel messages:", error);
          socket.emit("message-error", {
            error: "Failed to fetch channel messages",
            details: error.message,
            channelId,
          });
        }
      });

      // Handle channel messages
      socket.on("channel-message", async (data) => {
        try {
          const { channelId, text, richText, blocks, senderId, senderDisplay, attachments = [] } = data;
      
          // 1. Create and save the message
          const newMessage = new Message({
            channelId,
            senderId,
            senderDisplay: senderDisplay || "Unknown User",
            text,
            richText,
            blocks,
            attachments,
          });
          const savedMessage = await newMessage.save();
      
          // 2. Get all channel members
          const allMembers = await getChannelMembers(channelId, socket);
          
          // 3. Get active participants in channel room
          const activeSockets = await io.in(`channel-${channelId}`).fetchSockets();
          const activeUserIds = activeSockets.map(s => s.userId.toString());
      
          // 4. Identify inactive members (not in channel room)
          const inactiveMembers = allMembers.filter(
            memberId => memberId !== senderId && !activeUserIds.includes(memberId)
          );
      
          // 5. Update unread counts for inactive members
          if (inactiveMembers.length > 0) {
            await ChannelMemberStatus.bulkWrite(
              inactiveMembers.map(memberId => ({
                updateOne: {
                  filter: { channelId, userId: memberId },
                  update: {
                    $inc: { unreadCount: 1 },
                    $set: { lastUpdated: new Date() }
                  },
                  upsert: true
                }
              }))
            );
      
            // Send unread updates to inactive members
            const updatedCounts = await ChannelMemberStatus.find({
              channelId,
              userId: { $in: inactiveMembers }
            });
      
            updatedCounts.forEach(({ userId, unreadCount }) => {
              io.to(`user-${userId}`).emit("channel-unread-updated", {
                channelId,
                unreadCount
              });
            });
          }
      
          // 6. Broadcast message to:
          // - Active members in channel room
          // - Inactive members via their user rooms
          io.to(`channel-${channelId}`).emit("new-channel-message", savedMessage);
      
          inactiveMembers.forEach(memberId => {
            io.to(`user-${memberId}`).emit("new-channel-message", savedMessage);
          });
      
          // 7. Confirm to sender
          socket.emit("message-sent", savedMessage);
        } catch (error) {
          console.error("[Socket.io] Error sending channel message:", error);
          socket.emit("message-error", {
            error: "Failed to send channel message",
            details: error.message,
            channelId
          });
        }
      });

      socket.on("direct-message", async (data) => {
        try {
          const { dmId, senderId, ...messageData } = data;

          // 1. Save the message
          const newMessage = new Message({
            dmConversationId: dmId,
            senderId,
            ...messageData,
          });
          const savedMessage = await newMessage.save();

          // 2. Update conversation
          const conversation = await DMConversation.findByIdAndUpdate(
            dmId,
            {
              $set: {
                lastMessageId: savedMessage._id,
                lastMessageAt: new Date(),
              },
              $inc: {
                "participants.$[elem].unreadCount": 1,
              },
            },
            {
              arrayFilters: [
                {
                  "elem.userId": { $ne: senderId },
                },
              ],
              new: true,
            }
          );

          if (!conversation) throw new Error("Conversation not found");

          // 3. Prepare response data
          const responseData = {
            message: savedMessage,
            dmId,
          };

          // 4. Send to ALL OTHER participants in the room (excluding sender)
          socket.to(`dm-${dmId}`).emit("new-direct-message", responseData);

          // 5. Update unread counts for those NOT in the room
          conversation.participants.forEach((participant) => {
            const participantId = participant.userId.toString();
            if (participantId !== senderId) {
              io.to(`user-${participantId}`).emit("dm-unread-updated", {
                dmId,
                senderId: senderId,
                unreadCount: participant.unreadCount,
              });
            }
          });

          // 6. Confirm to sender ONLY (not through room)
          socket.emit("message-sent", responseData);
        } catch (error) {
          console.error("[Socket.io] Error:", error);
          socket.emit("message-error", {
            error: "Failed to send message",
            details: error.message,
          });
        }
      });

      // Handle message updates
      socket.on("update-message", async (data) => {
        try {
          const { messageId, text, richText, blocks, updatedAttachments } =
            data;

          const updatedMessage = await Message.findByIdAndUpdate(
            messageId,
            {
              text,
              richText,
              blocks,
              attachments: updatedAttachments,
              isEdited: true,
              updatedAt: new Date(),
            },
            { new: true }
          );

          if (!updatedMessage) {
            throw new Error("Message not found");
          }

          // Determine the room to notify based on message type
          const room = updatedMessage.channelId
            ? `channel-${updatedMessage.channelId}`
            : `dm-${updatedMessage.dmConversationId}`;

          io.to(room).emit("message-updated", {
            message: updatedMessage,
          });
        } catch (error) {
          console.error("[Socket.io] Error updating message:", error);
          socket.emit("message-error", {
            error: "Failed to update message",
            details: error.message,
          });
        }
      });

      // Handle message deletion
      socket.on("delete-message", async (data) => {
        try {
          const { messageId } = data;

          const deletedMessage = await Message.findByIdAndUpdate(
            messageId,
            {
              deletedAt: new Date(),
            },
            { new: true }
          );

          if (!deletedMessage) {
            throw new Error("Message not found");
          }

          // Determine the room to notify based on message type
          const room = deletedMessage.channelId
            ? `channel-${deletedMessage.channelId}`
            : `dm-${deletedMessage.dmConversationId}`;

          io.to(room).emit("message-deleted", {
            messageId: deletedMessage._id,
            deletedAt: deletedMessage.deletedAt,
            channelId: deletedMessage.channelId,
            dmId: deletedMessage.dmConversationId,
          });
        } catch (error) {
          console.error("[Socket.io] Error deleting message:", error);
          socket.emit("message-error", {
            error: "Failed to delete message",
            details: error.message,
          });
        }
      });

      // Handle reactions
      socket.on("add-reaction", async (data) => {
        try {
          const { messageId, userId, emoji } = data;

          const message = await Message.findById(messageId);
          if (!message) {
            throw new Error("Message not found");
          }

          // Remove existing reaction from this user if it exists
          message.reactions = message.reactions.filter(
            (r) => !(r.userId.equals(userId) && r.emoji === emoji)
          );

          // Add new reaction
          message.reactions.push({
            userId,
            emoji,
            createdAt: new Date(),
          });

          const updatedMessage = await message.save();

          // Determine the room to notify based on message type
          const room = updatedMessage.channelId
            ? `channel-${updatedMessage.channelId}`
            : `dm-${updatedMessage.dmConversationId}`;

          io.to(room).emit("reaction-added", {
            messageId: updatedMessage._id,
            reactions: updatedMessage.reactions,
          });
        } catch (error) {
          console.error("[Socket.io] Error adding reaction:", error);
          socket.emit("message-error", {
            error: "Failed to add reaction",
            details: error.message,
          });
        }
      });

      // socket.on("reset-channel-unread-count", async (channelId) => {
      //   console.log(
      //     `[Socket.io] Resetting unread count for user ${socket.userId} in channel ${channelId}`
      //   );

      //   await ChannelMember.findOneAndUpdate(
      //     { userId: socket.userId, channelId: channelId },
      //     { unreadCount: 0, lastReadAt: new Date() }
      //   );

      //   socket.emit("unread-count-reset", { userId, channelId });
      //   console.log(
      //     `[Socket.io] Unread count reset for user ${socket.userId} in channel ${channelId}`
      //   );
      // });

      socket.on("reset-dm-unread-count", async ({ dmId }) => {
        try {
          const userId = socket.user._id;

          const result = await DMConversation.updateOne(
            {
              _id: dmId,
              "participants.userId": userId,
            },
            {
              $set: {
                "participants.$.unreadCount": 0,
                "participants.$.lastReadAt": new Date(),
              },
            }
          );

          if (result.modifiedCount === 0) {
            console.warn(
              `No conversation found or user not participant (dmId: ${dmId}, userId: ${userId})`
            );
            return;
          }

          socket.emit("dm-unread-count-reset", {
            dmId,
            userId,
            unreadCount: 0,
          });
        } catch (error) {
          console.error("Error resetting DM unread count:", error);
          socket.emit("error", {
            event: "reset-dm-unread-count",
            message: "Failed to reset unread count",
          });
        }
      });

      socket.on("remove-reaction", async (data) => {
        try {
          const { messageId, userId, emoji } = data;

          const message = await Message.findById(messageId);
          if (!message) {
            throw new Error("Message not found");
          }

          // Remove the reaction
          message.reactions = message.reactions.filter(
            (r) => !(r.userId.equals(userId) && r.emoji === emoji)
          );

          const updatedMessage = await message.save();

          // Determine the room to notify based on message type
          const room = updatedMessage.channelId
            ? `channel-${updatedMessage.channelId}`
            : `dm-${updatedMessage.dmConversationId}`;

          io.to(room).emit("reaction-removed", {
            messageId: updatedMessage._id,
            reactions: updatedMessage.reactions,
          });
        } catch (error) {
          console.error("[Socket.io] Error removing reaction:", error);
          socket.emit("message-error", {
            error: "Failed to remove reaction",
            details: error.message,
          });
        }
      });

      socket.on("file-upload", async (data, callback) => {
        try {
          const {
            fileName,
            fileType,
            fileData,
            conversationId,
            isChannel,
            senderDisplay,
            text = "",
            richText = [],
            blocks = [],
          } = data;

          // 1. Upload file and get URL
          // const attachment = await uploadFile({
          //   fileName,
          //   fileType,
          //   fileData
          // });

          // 2. Prepare message data
          const messageData = {
            [isChannel ? "channelId" : "dmConversationId"]: conversationId,
            text: text || fileName, // fallback to filename if no text
            richText,
            blocks,
            senderId: socket.userId,
            // attachments: [attachment]
          };

          // 3. Handle sender display differently for channels vs DMs
          if (isChannel) {
            // For channels, get from verifyChannelMembership (which has caching)
            const membership = await verifyChannelMembership(
              socket.userId,
              conversationId
            );
            messageData.senderDisplay = membership?.userData || "Unknown User";
          } else {
            // For DMs, use what frontend sent (they should have this cached)
            messageData.senderDisplay = frontendSenderDisplay || "Unknown User";
          }

          // 4. Save and broadcast message
          if (isChannel) {
            // Channel message flow
            const newMessage = new Message({
              channelId: messageData.channelId,
              senderId: socket.userId,
              senderDisplay: messageData.senderDisplay,
              content: messageData.content,
              // attachments: messageData.attachments,
            });

            const savedMessage = await newMessage.save();
            io.to(`channel-${messageData.channelId}`).emit(
              "new-channel-message",
              {
                message: savedMessage,
                channelId: messageData.channelId,
              }
            );
            callback({ success: true, message: savedMessage });
          } else {
            // DM message flow
            const newMessage = new Message({
              dmConversationId: messageData.dmId,
              senderId: socket.userId,
              senderDisplay: messageData.senderDisplay,
              content: messageData.content,
              // attachments: messageData.attachments,
            });

            const savedMessage = await newMessage.save();
            await DMConversation.findByIdAndUpdate(messageData.dmId, {
              lastMessageId: savedMessage._id,
              lastMessageAt: new Date(),
              updatedAt: new Date(),
            });
            socket.to(`dm-${messageData.dmId}`).emit("new-direct-message", {
              message: savedMessage,
              dmId: messageData.dmId,
            });
            callback({ success: true, message: savedMessage });
          }
        } catch (error) {
          console.error("File upload processing error:", error);
          callback({ success: false, error: error.message });
        }
      });

      // Add error listener for the socket
      socket.on("error", (error) => {
        console.error(`[Socket.io] Error on socket ${socket.id}:`, error);
      });

      socket.on("disconnect", () => {
        // Clean up DM typing indicators
        Object.keys(typingUsers).forEach((dmId) => {
          if (typingUsers[dmId].has(socket.userId)) {
            typingUsers[dmId].delete(socket.userId);
            socket.to(`dm-${dmId}`).emit("user-typing", {
              dmId,
              userId: socket.userId,
              isTyping: false,
            });
          }
        });

        for (const [userId, dm] of Object.entries(activeDMViewers)) {
          if (socket.userId === userId) {
            delete activeDMViewers[userId];
          }
        }

        // Clean up channel typing indicators
        Object.keys(channelTypingUsers).forEach((channelId) => {
          if (channelTypingUsers[channelId]?.has(socket.userId)) {
            channelTypingUsers[channelId].delete(socket.userId);
            socket.to(`channel-${channelId}`).emit("channel-user-typing", {
              channelId,
              typingUsers: Array.from(channelTypingUsers[channelId] || []),
            });
          }
        });
      });
    });

    // Add error listener for the io instance
    io.on("error", (error) => {
      console.error("[Socket.io] Server error:", error);
    });

    console.log("[Socket.io] Initialization completed successfully");
    return io;
  } catch (error) {
    console.error("[Socket.io] Initialization failed:", error);
    throw error;
  }
};

export const getIO = () => {
  console.log("[Socket.io] Getting IO instance...");
  if (!io) {
    const errorMsg = "Socket.io not initialized. Call initSocket() first.";
    console.error("[Socket.io] Error:", errorMsg);
    throw new Error(errorMsg);
  }
  console.log("[Socket.io] Returning existing IO instance");
  return io;
};
