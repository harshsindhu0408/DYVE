import { eventBus } from "./rabbit.js";
import { getUsersForDmList } from "./dmVisibility.service.js";
import { redis } from "./redis.js";
import { DMConversation } from "../models/dm.model.js";
import { Message } from "../models/message.model.js";
export const setupUserEventHandlers = () => {
  // eventBus.subscribe(
  //   "user_events",
  //   "message_service_data_queue",
  //   "user.data.response",
  //   async (message) => {
  //     try {
  //       if (message.userId && message.userData) {
  //         // Cache the user data
  //         await redis.set(
  //           `user:${message.userId}`,
  //           JSON.stringify(message.userData),
  //           "EX",
  //           86400 // 24h TTL
  //         );
  //       }
  //     } catch (error) {
  //       console.error("Failed to cache user data:", error);
  //     }
  //   }
  // );

  // Handle DM visibility requests

  eventBus.subscribe(
    "message_queries",
    "message_dm_visibility",
    "dm.visibility.request",
    async (message) => {
      try {
        const { userId, workspaceId, correlationId } = message;
        const users = await getUsersForDmList(userId, workspaceId);

        await eventBus.publish("message_events", "dm.visibility.response", {
          correlationId,
          users,
        });
      } catch (error) {
        console.error("Error handling DM visibility request:", error);
      }
    }
  );

  eventBus.subscribe(
    "workspace_events",
    "message_service_welcome_dms",
    "workspace.member.joined",
    async (event) => {
      try {
        // Validate event
        if (!event || !event.shouldCreateWelcomeDMs || !event.adminMembers) {
          console.log("Skipping DM creation due to missing required fields");
          return;
        }

        const { workspaceId, userId, adminMembers, userData } = event;

        // Create lookup map for admin data
        const adminDataMap = {};
        event.adminMembers.forEach((admin) => {
          adminDataMap[admin.userId.toString()] = admin.userDisplay;
        });

        // Include owner in the list if not already an admin
        const ownerData = event.adminMembers.find(
          (a) => a.userId.toString() === event.ownerId.toString()
        )?.userDisplay;
        if (ownerData) {
          adminDataMap[event.ownerId.toString()] = ownerData;
        }

        // Get all unique user IDs to create DMs with
        const usersToCreateDMsWith = [
          event.ownerId,
          ...event.adminMembers.map((a) => a.userId),
        ].filter(
          (id, index, self) =>
            id.toString() !== userId.toString() && // Don't create DM with self
            self.indexOf(id) === index // Remove duplicates
        );

        const createdDMs = await Promise.all(
          usersToCreateDMsWith.map(async (adminId) => {
            // Check if DM already exists
            const existingDM = await DMConversation.findOne({
              participantIds: { $all: [userId, adminId] },
              workspaceId,
            });

            if (existingDM) return existingDM;

            // Create new DM conversation
            const newDM = new DMConversation({
              workspaceId:  workspaceId,
              participants: [
                {
                  userId: userId,
                  userDisplay: userData,
                  joinedAt: new Date(),
                  isActive: true,
                },
                {
                  userId: adminId,
                  userDisplay: adminDataMap[adminId.toString()],
                  joinedAt: new Date(),
                  isActive: true,
                },
              ],
              participantIds: [userId, adminId],
              isWelcomeDM: true,
            });

            await newDM.save();

            // Send welcome message
            await eventBus.publish(
              "message_commands",
              "message.welcome_dm.create",
              {
                dmConversationId: newDM._id,
                senderId: adminId,
                senderDisplay: adminDataMap[adminId.toString()],
                workspaceId,
                content: `Welcome to ${event.workspaceName}! Let me know if you need any help.`,
                isSystemMessage: true,
              }
            );

            return newDM;
          })
        );

        // Publish creation event
        await eventBus.publish("message_events", "welcome_dms.created", {
          userId,
          workspaceId,
          dmIds: createdDMs.map((dm) => dm._id),
          timestamp: new Date(),
        });
      } catch (error) {
        console.error("Failed to create welcome DMs:", error);
        await eventBus.publish("error_events", "welcome_dms.creation.failed", {
          userId: event?.userId,
          workspaceId: event?.workspaceId,
          error: error.message,
          timestamp: new Date(),
        });
      }
    }
  );

  eventBus.subscribe(
    "user_events",
    "message_service_user_updates_queue",
    "user.updated",
    async (data) => {
      try {
        const { userId, changes } = data;

        // Update DM Conversations
        await DMConversation.updateMany(
          { "participants.userId": userId },
          {
            $set: {
              "participants.$[elem].userDisplay.name": changes.name,
              "participants.$[elem].userDisplay.avatar": changes.avatar,
              "participants.$[elem].userDisplay.status": changes.status,
              "participants.$[elem].userDisplay.bio": changes.bio,
              "participants.$[elem].userDisplay.email": changes.email,
            },
          },
          { arrayFilters: [{ "elem.userId": userId }] }
        );

        // Update Messages
        await Message.updateMany(
          { senderId: userId },
          {
            $set: {
              "senderDisplay.name": changes.name,
              "senderDisplay.avatar": changes.avatar,
              "senderDisplay.status": changes.status,
              "senderDisplay.bio": changes.bio,
            },
          }
        );

        console.log(`Successfully updated user data for ${userId}`);
      } catch (error) {
        console.error("Failed to update user data:", error);
      }
    }
  );

  console.log("✅ Message event listeners ready");
};
