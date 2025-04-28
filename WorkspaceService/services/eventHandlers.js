// Add to workspace service's event listeners file
import { eventBus } from "./rabbit.js";
import redis from "./redis.js";

export const setupEventListeners = () => {

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

  console.log("✅ User data event listeners ready");
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
