// userDataAccess.js in workspace service
import { eventBus } from "./rabbit.js";

export async function requestUserData(userId) {
  return new Promise(async (resolve) => {
    const correlationId = generateCorrelationId();
    const responseQueue = `user_data_res_${correlationId}`;

    // Set up temporary listener
    const cleanup = () => {
      eventBus.unsubscribe(responseQueue);
      eventBus.deleteQueue(responseQueue);
      clearTimeout(timeout);
    };

    const timeout = setTimeout(() => {
      cleanup();
      resolve(null);
    }, 3000); // 3-second timeout

    eventBus.subscribe(
      "user_events",
      responseQueue,
      "user.data.response",
      async (message) => {
        if (message.correlationId === correlationId && message.userData) {
          cleanup();
          resolve(message.userData);
        }
      }
    );

    // Send data request
    await eventBus.publish("user_queries", "user.data.request", {
      userId,
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