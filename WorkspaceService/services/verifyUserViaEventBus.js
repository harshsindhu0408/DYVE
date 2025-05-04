import { eventBus } from "./rabbit.js";
import redis from "./redis.js";

export async function verifyUserViaEventBus(email) {
  return new Promise(async (resolve) => {
    const correlationId = generateCorrelationId();
    const responseQueue = `verify_res_${correlationId}`;

    // Set up temporary listener
    const cleanup = () => {
      eventBus.unsubscribe(responseQueue);
      eventBus.deleteQueue(responseQueue);
      clearTimeout(timeout);
    };

    const timeout = setTimeout(() => {
      cleanup();
      resolve(null);
    }, 5000); // 5-second timeout

    eventBus.subscribe(
      "user_events",
      responseQueue,
      "user.verified",
      async (message) => {
        if (message.correlationId === correlationId) {
          cleanup();
          if (message.exists) {
            // Cache valid user IDs
            await redis.set(
              `user:email:${email}`,
              message.userId,
              "EX",
              86400 // 24h TTL
            );
          }
          resolve(message.exists ? message.userId : null);
        }
      }
    );

    // Send verification request
    await eventBus.publish("user_queries", "user.verify_request", {
      email,
      correlationId,
    });
  });
}

function generateCorrelationId() {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
}
