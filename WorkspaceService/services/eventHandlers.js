import { eventBus } from "./rabbit.js";
export const setupEventListeners = () => {
  console.log("All event listeners initialized");
  // User profile updates
  eventBus.subscribe(
    "user_events",
    "workspace_service_queue",
    "user.updated",
    "user.deleted",
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
      } catch (error) {
        console.error("Failed to process user update:", error);
      }
    }
  );

  // Workspace member role changes
  eventBus.subscribe(
    "user_events",
    "workspace_service_events_queue", // Different from RPC queue
    "user.updated",
    async (data) => {
      // Sync role changes to channel service if needed
      console.log("Role updated event received:", data);
    }
  );
};
