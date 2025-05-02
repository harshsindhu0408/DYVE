import ChannelMember from "../models/channelMembers.model.js";
import { eventBus } from "./rabbit.js";
import Channel from "../models/channel.model.js";
import { redis } from "./redis.js";

export const setupEventListeners = () => {
  eventBus.subscribe(
    "user_events",
    "channel_service_user_update_queue",
    "user.updated",
    async (data) => {
      try {
        const { userId, changes } = data;
        await updateChannelMembers(userId, changes);

        // Update Redis cache
        const userKey = `user:${userId}`;
        const cachedUser = await redis.get(userKey);
        if (cachedUser) {
          const userData = JSON.parse(cachedUser);
          await redis.set(
            userKey,
            JSON.stringify({ ...userData, ...changes }),
            "EX",
            86400 // 24h TTL
          );
        }
      } catch (error) {
        console.error("Failed to process user update:", error);
      }
    }
  );

  eventBus.subscribe(
    "user_events",
    "channel_service_data_queue",
    "user.data.response",
    async (message) => {
      try {
        if (message.userId && message.userData) {
          // Cache the user data
          await redis.set(
            `user:${message.userId}`,
            JSON.stringify(message.userData),
            "EX",
            86400 // 24h TTL
          );
        }
      } catch (error) {
        console.error("Failed to cache user data:", error);
      }
    }
  );

  eventBus.subscribe(
    "user_events",
    "channel_service_user_delete_queue",
    "user.deleted",
    async (message) => {
      try {
        if (!message?.userId) {
          console.error("Invalid user deletion message format:", message);
          return;
        }

        const { userId } = message;

        // Soft delete all channel memberships
        const memberResult = await ChannelMember.updateMany(
          { userId },
          {
            $set: {
              status: "deleted",
              "userDisplay.status": "deleted",
              deletedAt: new Date(),
            },
          }
        );

        // Update channels where user was the creator
        const channelResult = await Channel.updateMany(
          { "createdBy.userId": userId },
          {
            $set: {
              "createdBy.status": "deleted",
              "createdBy.avatar": null,
            },
          }
        );

        await eventBus.publish(
          "channel_events",
          "user.channel_memberships.deleted",
          {
            userId,
            deletedCount: memberResult.modifiedCount,
            updatedChannelsCount: channelResult.modifiedCount,
            timestamp: new Date().toISOString(),
          }
        );
      } catch (error) {
        console.error("Failed to process user deletion:", error);
        await eventBus.publish("error_events", "channel.user_deletion.failed", {
          userId: message?.userId,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      }
    }
  );

  eventBus.subscribe(
    "workspace_events",
    "channel_service_workspace_create_queue",
    "workspace.created",
    async (event) => {
      try {
        const {
          workspaceId,
          ownerId,
          workspaceName,
          defaultChannel,
          userData,
        } = event;

        // Enhanced validation
        if (!event || typeof event !== "object") {
          throw new Error("Event is not an object");
        }

        const requiredFields = ["workspaceId", "ownerId", "userData"];
        const missingFields = requiredFields.filter((field) => !event[field]);

        if (missingFields.length > 0) {
          throw new Error(
            `Missing required fields: ${missingFields.join(", ")}`
          );
        }

        if (
          !event.userData?.profile ||
          typeof event.userData.profile !== "object"
        ) {
          throw new Error("Invalid userData.profile format");
        }

        // Create the default public channel
        const newChannel = await Channel.create({
          workspaceId,
          name: defaultChannel?.name || "general",
          description:
            defaultChannel?.description || "General discussion channel",
          type: "public",

          workspaceName,
          createdBy: {
            userId: ownerId,
            name: userData.profile.name,
            avatar: userData.profile.avatar,
            status: userData.status,
            bio: userData.profile.bio,
          },
        });

        // Add the workspace owner as channel member
        await ChannelMember.create({
          channelId: newChannel._id,
          userId: ownerId,
          userDisplay: {
            name: userData.profile.name,
            avatar: userData.profile.avatar,
            status: userData.status,
            bio: userData.profile.bio,
          },
          role: "owner",
          lastReadAt: new Date(),
          notificationPref: "all",
        });

        await eventBus.publish("channel_events", "channel.created", {
          channelId: newChannel._id,
          workspaceId,
          isPublic: true,
          initialMembers: [ownerId],
        });
      } catch (error) {
        console.error("Failed to create default channel:", error);
        if (error.name !== "MongoError" || error.code !== 11000) {
          await eventBus.publish("error_events", "channel.creation.failed", {
            workspaceId: event?.workspaceId,
            ownerId: event?.ownerId,
            error: error.message,
          });
        }
      }
    }
  );

  eventBus.subscribe(
    "workspace_events",
    "channel_service_member_add_queue",
    "workspace.member.joined",
    async (event) => {
      try {
        // Validate event structure
        if (!event || typeof event !== "object") {
          throw new Error("Event is not an object");
        }

        const { workspaceId, userId, userData, membership } = event;

        // Validate required fields
        if (!workspaceId || !userId || !userData) {
          throw new Error("Missing required fields in event");
        }

        // Validate userData structure
        if (typeof userData !== "object" || !userData.name) {
          throw new Error("Invalid userData format - must contain name");
        }

        // Find all public, non-archived channels in the workspace
        const publicChannels = await Channel.find({
          workspaceId,
          type: "public",
          isArchived: false,
        });


        // Prepare bulk operations to add user to all public channels
        const bulkOps = publicChannels.map((channel) => ({
          updateOne: {
            filter: {
              channelId: channel._id,
              userId: userId,
            },
            update: {
              $setOnInsert: {
                channelId: channel._id,
                userId: userId,
                userDisplay: {
                  name: userData.name,
                  avatar: userData.avatar || "",
                  status: userData.status || "active",
                  bio: userData.bio || "",
                  email: userData.email || "",
                },
                role: membership?.role || "member",
                lastReadAt: new Date(),
                notificationPref:
                  channel.customSettings?.defaultNotificationPref || "all",
              },
            },
            upsert: true,
          },
        }));

        // Execute bulk operation if there are channels
        if (bulkOps.length > 0) {
          await ChannelMember.bulkWrite(bulkOps);
        }

        // Publish success event
        await eventBus.publish(
          "channel_events",
          "channel.membership.bulk_added",
          {
            userId,
            workspaceId,
            channelIds: publicChannels.map((c) => c._id),
            timestamp: new Date(),
          }
        );
      } catch (error) {
        console.error("Failed to add user to public channels:", error);
        await eventBus.publish("error_events", "channel.member_add.failed", {
          workspaceId: event?.workspaceId,
          userId: event?.userId,
          error: error.message,
          timestamp: new Date(),
        });
      }
    }
  );

  console.log("✅ User data event listeners ready");
};

async function updateChannelMembers(userId, changes) {
  if (!userId) {
    console.warn("Skipping update: Missing userId");
    return;
  }

  if (
    !changes ||
    typeof changes !== "object" ||
    Object.keys(changes).length === 0
  ) {
    console.warn("Skipping update: No valid changes provided");
    return;
  }

  try {
    // Prepare the updates for both ChannelMember and Channel collections
    const memberUpdates = {};
    const channelUpdates = {};

    // Only include fields that actually exist in changes
    if (changes.name) {
      memberUpdates["userDisplay.name"] = changes.name;
      channelUpdates["createdBy.name"] = changes.name;
    }
    if (changes.avatar) {
      memberUpdates["userDisplay.avatar"] = changes.avatar;
      channelUpdates["createdBy.avatar"] = changes.avatar;
    }
    if (changes.status) {
      memberUpdates["userDisplay.status"] = changes.status;
      channelUpdates["createdBy.status"] = changes.status;
    }
    if (changes.bio) {
      memberUpdates["userDisplay.bio"] = changes.bio;
      channelUpdates["createdBy.bio"] = changes.bio;
    }

    // Execute updates only if we have valid fields
    const updateOperations = [];

    if (Object.keys(memberUpdates).length > 0) {
      updateOperations.push(
        ChannelMember.updateMany({ userId }, { $set: memberUpdates })
      );
    }

    if (Object.keys(channelUpdates).length > 0) {
      updateOperations.push(
        Channel.updateMany(
          { "createdBy.userId": userId },
          { $set: channelUpdates }
        )
      );
    }

    if (updateOperations.length === 0) {
      console.warn("No valid fields to update");
      return;
    }

    // Execute all updates in parallel
    const results = await Promise.all(updateOperations);
  } catch (error) {
    console.error("Error updating user profile across collections:", error);
    throw error; // Re-throw if you want the caller to handle it
  }
}
