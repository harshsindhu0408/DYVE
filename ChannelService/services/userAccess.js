// userDataAccess.js in channel service
import { eventBus } from "./rabbit.js";

const REQUEST_TIMEOUT = 3000;

async function createTemporaryRequest({
  exchange,
  queuePrefix,
  routingKey,
  requestExchange,
  requestRoutingKey,
  requestPayload,
  responseValidator = () => true,
}) {
  return new Promise(async (resolve, reject) => {
    const correlationId = generateCorrelationId();
    const responseQueue = `${queuePrefix}_${correlationId}`;
    let timeoutId;

    const cleanup = async () => {
      clearTimeout(timeoutId);
      try {
        await eventBus.unsubscribe(responseQueue);
        await eventBus.deleteQueue(responseQueue);
      } catch (error) {
        console.error("Cleanup error:", error);
      }
    };

    const fail = (error) => {
      cleanup().finally(() => reject(error));
    };

    timeoutId = setTimeout(() => {
      fail(new Error(`Request timed out after ${REQUEST_TIMEOUT}ms`));
    }, REQUEST_TIMEOUT);

    try {
      await eventBus.subscribe(
        exchange,
        responseQueue,
        routingKey,
        async (message) => {
          try {
            if (
              message.correlationId === correlationId &&
              responseValidator(message)
            ) {
              await cleanup();
              resolve(message);
            }
          } catch (error) {
            fail(error);
          }
        },
        {
          exclusive: true,
          autoDelete: true,
          durable: false,
        }
      );

      await eventBus.publish(requestExchange, requestRoutingKey, {
        ...requestPayload,
        correlationId,
        responseQueue, // Make response queue explicit
      });
    } catch (error) {
      fail(error);
    }
  });
}

export async function requestUserData(userId, workspaceId) {
  return createTemporaryRequest({
    exchange: "workspace_events",
    queuePrefix: "workspace_user_data_res",
    routingKey: "workspace.user.data.response",
    requestExchange: "workspace_queries",
    requestRoutingKey: "workspace.user.data.request",
    requestPayload: { userId, workspaceId },
    responseValidator: (message) => !!message.userData,
  });
}

export async function requestUserDataFromUserService(userId) {
  return createTemporaryRequest({
    exchange: "user_events",
    queuePrefix: "user_data_res",
    routingKey: "user.data.response",
    requestExchange: "user_queries",
    requestRoutingKey: "user.data.request",
    requestPayload: { userId },
    responseValidator: (message) => !!message.userData,
  });
}

function generateCorrelationId() {
  return crypto.randomUUID(); // Better than Math.random()
}
