// workspace/services/userCache.js
import { eventBus } from "./rabbit.js";
import redis from "./redis.js";

// Initialize listener
export const setupUserEventListeners = () => {
  eventBus.subscribe(
    "user_events",
    "workspace_service_queue",
    "user.registered",
    async (user) => {
      await redis.set(`user:email:${user.email}`, user.userId, "EX", 86400);
      console.log(`Cached ${user.email}`);
    }
  );

  eventBus.subscribe(
    "user_events",
    "workspace_service_queue",
    "user.verified",
    async (response) => {
      if (response.exists) {
        await redis.set(
          `user:email:${response.email}`,
          response.userId,
          "EX",
          86400
        );
      }
    }
  );
};
