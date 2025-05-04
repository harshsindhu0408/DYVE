// userDataAccess.js in message service
import { eventBus } from "./rabbit.js";

export async function requestUserDataFromWorkspace(userId, workspaceId) {
  return new Promise(async (resolve) => {
    const correlationId = generateCorrelationId();
    const responseQueue = `workspace_user_data_res_${correlationId}`;

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
      "workspace_events",
      responseQueue,
      "workspace.user.data.response",
      async (message) => {
        if (message.correlationId === correlationId && message.userData) {
          cleanup();
          resolve(message.userData);
        }
      }
    );

    // Send data request
    await eventBus.publish("workspace_queries", "workspace.user.data.request", {
      userId,
      workspaceId,
      correlationId,
    });
  });
}

export async function requestUserDataFromUserService(userId) {
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