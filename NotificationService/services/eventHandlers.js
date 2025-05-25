import { eventBus } from "./rabbit.js";
import { getUsersForDmList } from "./dmVisibility.service.js";
import { redis } from "./redis.js";
import { DMConversation } from "../models/dm.model.js";
import { Message } from "../models/message.model.js";
import { connectRedis } from "./redis.js";
export const setupUserEventHandlers = async () => {
  // Automatically create DM conversations when a user joins a workspace
  // This is triggered by the "workspace.member.joined" event
  // from the workspace service
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
              workspaceId: workspaceId,
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

  // Handle user updates from the workspace service
  // This is triggered by the "member.profile.updated" event
  // from the workspace service
  eventBus.subscribe(
    "workspace_events",
    "message_service_user_updates_queue",
    "member.profile.updated",
    async (data) => {
      try {
        const { workspaceId, userId, changes } = data;

        const redis = await connectRedis();

        const pattern = `channel_user_data:${userId}:*`;
        const keys = await redis.keys(pattern);

        for (const key of keys) {
          const cachedRaw = await redis.get(key);
          if (!cachedRaw) continue;

          let parsed;
          try {
            parsed = JSON.parse(cachedRaw);
          } catch (err) {
            console.error(
              `❌ Failed to parse cached value for key ${key}:`,
              err
            );
            continue;
          }

          const { userData = {}, isMember } = parsed;

          const updatedUserData = { ...userData, ...changes };
          const updatedPayload = { userData: updatedUserData, isMember };

          await redis.set(key, JSON.stringify(updatedPayload), {
            EX: 60 * 60 * 24, // 24 hours
          });
          console.log(`♻️ Redis cache updated for key: ${key}`);
        }

        // Build update object for DMConversation
        const dmUpdate = {};
        if (changes.name)
          dmUpdate["participants.$[elem].userDisplay.name"] = changes.name;
        if (changes.avatar)
          dmUpdate["participants.$[elem].userDisplay.avatar"] = changes.avatar;
        if (changes.status)
          dmUpdate["participants.$[elem].userDisplay.status"] = changes.status;
        if (changes.bio)
          dmUpdate["participants.$[elem].userDisplay.bio"] = changes.bio;
        if (changes.email)
          dmUpdate["participants.$[elem].userDisplay.email"] = changes.email;
        if (changes.userCurrentStatus)
          dmUpdate["participants.$[elem].userDisplay.userCurrentStatus"] =
            changes.userCurrentStatus;

        if (Object.keys(dmUpdate).length > 0) {
          await DMConversation.updateMany(
            {
              "participants.userId": userId,
              workspaceId: workspaceId,
            },
            { $set: dmUpdate },
            { arrayFilters: [{ "elem.userId": userId }] }
          );
        }

        // Build update object for Messages
        const messageUpdate = {};
        if (changes.name) messageUpdate["senderDisplay.name"] = changes.name;
        if (changes.avatar)
          messageUpdate["senderDisplay.avatar"] = changes.avatar;
        if (changes.status)
          messageUpdate["senderDisplay.status"] = changes.status;
        if (changes.bio) messageUpdate["senderDisplay.bio"] = changes.bio;
        if (changes.userCurrentStatus)
          messageUpdate["senderDisplay.userCurrentStatus"] =
            changes.userCurrentStatus;
        if (Object.keys(messageUpdate).length > 0) {
          await Message.updateMany(
            {
              senderId: userId,
              workspaceId: workspaceId, // Add workspaceId condition
            },
            { $set: messageUpdate }
          );
        }

        console.log(
          `Successfully updated user data for ${userId} in workspace ${workspaceId}`
        );
      } catch (error) {
        console.error("Failed to update user data:", error);
      }
    }
  );

  // Automatically create DM conversations when a user joins a channel
  // This is triggered by the "channel.member.joined" event
  // from the channel service
  eventBus.subscribe(
    "channel_events",
    "message_service_welcome_dms_channel",
    "channel.member.joined",
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
              workspaceId: workspaceId,
              participants: [
                {
                  userId: userId,
                  userDisplay: {
                    ...userData,
                    userCurrentStatus: userData.userCurrentStatus,
                  },
                  joinedAt: new Date(),
                  isActive: true,
                },
                {
                  userId: adminId,
                  userDisplay: {
                    ...adminDataMap[adminId.toString()],
                    userCurrentStatus:
                      adminDataMap[adminId.toString()].userCurrentStatus,
                  },
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
    "channel_events",
    "message_service_welcome_dms_channel",
    "channel.member.left",
    async (event) => {
      try {
        const { channelId, userId } = event;

        // Fetch the DM conversations for the user
        const dmConversations = await DMConversation.find({
          participantIds: userId,
          isWelcomeDM: true,
        });

        // Filter out the DMs that are not related to the channel
        const filteredDMs = dmConversations.filter(
          (dm) => dm.channelId.toString() === channelId.toString()
        );

        // Delete the filtered DMs
        await Promise.all(
          filteredDMs.map((dm) => DMConversation.deleteOne({ _id: dm._id }))
        );

        console.log(`Deleted ${filteredDMs.length} DMs for user ${userId}`);
      } catch (error) {
        console.error("Failed to delete DMs:", error);
      }
    }
  );

  eventBus.subscribe(
    "workspace_events",
    "message_service_welcome_dms_channel",
    "workspace.created",
    async (event) => {
      try {
        const { workspaceId, userId, ownerId, userData, status, email } = event;

        const newDM = new DMConversation({
          workspaceId: workspaceId,
          participants: [
            {
              userId: ownerId,
              userDisplay: {
                ...userData.profile,
                userCurrentStatus: userData.profile.userCurrentStatus,
              },
              joinedAt: new Date(),
              isActive: true,
            },
            {
              userId: ownerId,
              userDisplay: {
                ...userData.profile,
                userCurrentStatus: userData.profile.userCurrentStatus,
              },
              joinedAt: new Date(),
              isActive: true,
            },
          ],
          participantIds: [ownerId, ownerId],
          isWelcomeDM: true,
        });
        await newDM.save();

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
    "channel_service_user_status_queue",
    "user.status.updated",
    async (data) => {
      try {
        const { userId, changes } = data;

        //updating the changes in DB
        await DMConversation.updateMany(
          { "participants.userId": userId },
          {
            $set: {
              "participants.$[elem].userDisplay.currentStatus":
                changes.currentStatus,
            },
          },
          { arrayFilters: [{ "elem.userId": userId }] }
        );

        // Update Messages
        await Message.updateMany(
          { senderId: userId },
          {
            $set: {
              "senderDisplay.currentStatus": changes.currentStatus,
            },
          }
        );
        // Update Redis cache
        const userKey = `user:${userId}`;
        const cachedUser = await redis.get(userKey);

        if (cachedUser) {
          const userData = JSON.parse(cachedUser);
          await redis.set(
            userKey,
            JSON.stringify({
              ...userData,
              currentStatus: changes.currentStatus,
            }),
            "EX",
            86400
          );
        }
      } catch (error) {
        console.error("Failed to process user.status.updated event:", error);
      }
    }
  );

  // Delete DM conversations when a user is removed from a workspace
  // This is triggered by the "member.removed" event
  // from the workspace service
  // This is a cleanup operation to remove any DM conversations
  // that are no longer relevant after a user leaves a workspace
  eventBus.subscribe(
    "workspace_events",
    "message_service_workspace_cleanup",
    "member.removed",
    async (event) => {
      try {
        const { workspaceId, userId } = event;
        const result = await DMConversation.deleteMany({
          workspaceId,
          participantIds: userId,
        });

        console.log(
          `Deleted ${result.deletedCount} DM conversations for user ${userId} in workspace ${workspaceId}`
        );

        // Publish event for any services that might need to know about the cleanup
        await eventBus.publish("message_events", "user_dms.cleaned", {
          workspaceId,
          userId,
          deletedCount: result.deletedCount,
          timestamp: new Date(),
        });
      } catch (error) {
        console.error("Failed to clean up DM conversations:", error);
      }
    }
  );

  console.log("✅ Message event listeners ready");
};
