// Add to workspace service's event listeners file
import { WorkspaceMember } from "../models/workspaceMember.model.js";
import { eventBus } from "./rabbit.js";
import { redis } from "./redis.js";
import { Workspace } from "../models/workspace.model.js";

export const setupEventListeners = async () => {
  // Existing workspace member update handler
  eventBus.subscribe(
    "user_events",
    "workspace_service_events_queue",
    "user.updated",
    async (data) => {
      try {
        const { userId, changes } = data;
        await updateWorkspaceMembers(userId, changes);

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

  // New handler for user data responses
  eventBus.subscribe(
    "user_events",
    "workspace_service_data_queue",
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

  await eventBus.subscribe(
    "workspace_queries",
    "workspace_user_service_data",
    "workspace.user.data.request",
    async ({ userId, workspaceId, correlationId }) => {
      try {
        console.log(`Data request received for workspace user: ${userId}`);

        const user = await WorkspaceMember.findOne({
          userId: userId,
          workspaceId: workspaceId,
        }).lean();
        if (!user) {
          console.warn(`User not found: ${userId}`);
          return;
        }

        // Prepare minimal required user data
        const userData = {
          id: user._id,
          userId: user.userId,
          name: user.userDisplay.name,
          email: user.email,
          avatar: user.userDisplay.avatar,
          phone: user.userDisplay.phone,
          bio: user.userDisplay.bio,
          status: user.status,
          role: user.role,
        };

        await publishWithRetry(
          "workspace_events",
          "workspace.user.data.response",
          { userId, userData, correlationId },
          { correlationId }
        );
      } catch (error) {
        console.error(`Error processing data request for ${userId}:`, error);
        await handleHandlerError(error, { userId, correlationId });
        throw error;
      }
    }
  );

  // eventBus.subscribe(
  //   "workspace_queries",
  //   "workspace_admins",
  //   "workspace.admins.request",
  //   async (message) => {
  //     const { workspaceId, correlationId, replyTo } = message;

  //     try {
  //       // First get the workspace owner from Workspace model
  //       const workspace = await Workspace.findById(workspaceId);
  //       if (!workspace) {
  //         throw new Error("Workspace not found");
  //       }

  //       const adminMembers = await WorkspaceMember.find({
  //         workspaceId,
  //         status: "active",
  //         role: { $in: ["admin", "owner"] },
  //       });

  //       // Combine owner from Workspace with admins from WorkspaceMember
  //       const admins = [
  //         workspace.ownerId, // Owner from Workspace model
  //         ...adminMembers
  //           .filter((member) => member.role === "admin") // Only include explicit admins
  //           .map((member) => member.userId),
  //       ].filter((value, index, self) => self.indexOf(value) === index); // Remove duplicates

  //       const adminDetails = await WorkspaceMember.find({
  //         userId: { $in: admins },
  //         workspaceId,
  //       }).select("userId userDisplay");

  //       await eventBus.publish(
  //         "workspace_events",
  //         "workspace.admins.response",
  //         {
  //           correlationId,
  //           admins: adminDetails.map((a) => ({
  //             userId: a.userId,
  //             name: a.userDisplay.name,
  //             avatar: a.userDisplay.avatar,
  //             role: a.role,
  //           })),
  //           workspaceId,
  //           timestamp: new Date().toISOString(),
  //         },
  //         { replyTo }
  //       );
  //     } catch (error) {
  //       console.error("Error handling admins request:", error);
  //       await eventBus.publish("error_events", "workspace.admins.error", {
  //         correlationId,
  //         error: error.message,
  //         workspaceId,
  //         timestamp: new Date().toISOString(),
  //       });
  //     }
  //   }
  // );

  console.log("✅ Workspace data event listeners ready");
};

async function updateWorkspaceMembers(userId, changes) {
  await WorkspaceMember.updateMany(
    { userId },
    {
      $set: {
        "userDisplay.name": changes.name,
        "userDisplay.avatar": changes.avatar,
        "userDisplay.status": changes.status,
        "userDisplay.bio": changes.bio,
      },
    }
  );
}

async function publishWithRetry(
  exchange,
  routingKey,
  message,
  options = {},
  maxAttempts = 3
) {
  let attempts = 0;
  while (attempts < maxAttempts) {
    try {
      await eventBus.publish(exchange, routingKey, message, options);
      return;
    } catch (error) {
      attempts++;
      console.error(`Publish attempt ${attempts} failed:`, error);

      if (attempts >= maxAttempts) {
        console.error("Max publish attempts reached");
        throw error;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, Math.pow(2, attempts) * 1000)
      );
    }
  }
}

async function handleHandlerError(error, context) {
  try {
    await eventBus.publish("user_errors", "user.handler_error", {
      ...context,
      error: error.message,
      stack: error.stack,
      timestamp: new Date(),
    });
  } catch (publishError) {
    console.error("Failed to publish error event:", publishError);
  }
}
