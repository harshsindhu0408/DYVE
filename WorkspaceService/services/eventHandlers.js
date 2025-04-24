import { eventBus } from "./rabbit.js";
import { UserCache } from "./userCache.js";

export const setupEventListeners = () => {
  // User profile updates
  eventBus.subscribe(
    "user_events",
    "workspace_service_queue",
    "user:updated",
    async (data) => {
      try {
        const { userId, changes } = data;
        await WorkspaceMember.updateMany(
          { userId },
          {
            $set: {
              "userDisplay.name": changes.name,
              "userDisplay.avatar": changes.avatar,
              "userDisplay.status": changes.status,
            },
          }
        );
        UserCache.invalidate(userId); // Clear cache if needed
      } catch (error) {
        console.error("Failed to process user update:", error);
      }
    }
  );

  // Workspace member role changes
  eventBus.subscribe(
    "workspace_events",
    "channel_service_queue",
    "member.role_updated",
    async (data) => {
      // Sync role changes to channel service if needed
      console.log("Role updated event received:", data);
    }
  );
};
