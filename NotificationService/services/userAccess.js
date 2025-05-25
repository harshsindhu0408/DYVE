// userDataAccess.js in message service
import { eventBus } from "./rabbit.js";
import { connectRedis } from "./redis.js";

export async function requestUserDataFromWorkspace(userId, workspaceId) {
  return new Promise(async (resolve) => {
    const correlationId = generateCorrelationId();
    const responseQueue = `workspace_user_data_from_message_res_${correlationId}`;
    // Set up temporary listener
    const cleanup = () => {
      eventBus.unsubscribe(responseQueue);
      eventBus.deleteQueue(responseQueue);
      clearTimeout(timeout);
    };

    const timeout = setTimeout(() => {
      cleanup();
      resolve(null);
    }, 10000);

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
    await eventBus.publish(
      "workspace_queries",
      "workspace.user.data.request.from.message",
      {
        userId,
        workspaceId,
        correlationId,
      }
    );
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
    }, 10000); // 10-second timeout

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

export async function verifyChannelMembership(userId, channelId) {
  const redis = await connectRedis();
  const cacheKey = `channel_user_data:${userId}:${channelId}`;

  // 1. Try cache first
  try {
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
      console.log(`🔁 Served from cache: ${cacheKey}`);
      return JSON.parse(cachedData);
    }
  } catch (err) {
    console.error("Redis cache check failed:", err);
    // Continue to live query despite cache failure
  }

  // 2. Setup live query with proper error handling
  return new Promise(async (resolve, reject) => {
    const correlationId = generateCorrelationId();
    const responseQueue = `channel_user_data_res_from_message_${correlationId}`;
    let timeout;
    let subscription;

    // Cleanup resources
    const cleanup = async () => {
      if (subscription) {
        try {
          await eventBus.unsubscribe(responseQueue);
          await eventBus.deleteQueue(responseQueue);
        } catch (err) {
          console.error("Cleanup error:", err);
        }
      }
      if (timeout) clearTimeout(timeout);
    };

    // Handle timeout
    timeout = setTimeout(async () => {
      await cleanup();
      console.error(`Timeout waiting for channel data (${correlationId})`);
      resolve(null); // Or reject if you prefer
    }, 10000);

    try {
      // Setup response handler
      subscription = await eventBus.subscribe(
        "channel_events",
        responseQueue,
        "channel.data.response",
        async (message) => {
          try {
            const { correlationId: msgCorrId, userData, isMember } = message;

            if (msgCorrId !== correlationId) return;
            if (userData === undefined || isMember === undefined) {
              console.error("Invalid message format", message);
              return;
            }

            const payloadToCache = { userData, isMember };

            // Cache the result
            try {
              await redis.set(cacheKey, JSON.stringify(payloadToCache), {
                EX: 60 * 60 * 24, // 24 hours
                NX: true // Only set if not exists
              });
              console.log(`✅ Cached membership data: ${cacheKey}`);
            } catch (cacheErr) {
              console.error("Caching failed:", cacheErr);
            }

            await cleanup();
            resolve(payloadToCache);
          } catch (handlerErr) {
            console.error("Message handler error:", handlerErr);
            await cleanup();
            resolve(null);
          }
        }
      );

      // Send request
      await eventBus.publish("channel_queries", "channel.data.request", {
        userId,
        channelId,
        correlationId,
      }, { deliveryMode: 2 }); // Persistent message

    } catch (publishErr) {
      console.error("Publish failed:", publishErr);
      await cleanup();
      resolve(null);
    }
  });
}

function generateCorrelationId() {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
}

export async function requestUserData(userId, workspaceId, token) {
  try {
    const response = await fetch(
      `${process.env.BASE_URL_WORKSPACE}/${workspaceId}/member/profile/${userId}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const data = await response.json();

    if (!data.success) {
      return null;
    }

    const userData = {
      id: data.data._id,
      userId: data.data.userId,
      name: data.data.userDisplay.name,
      email: data.data.email,
      avatar: data.data.userDisplay.avatar,
      phone: data.data.userDisplay.phone,
      bio: data.data.userDisplay.bio,
      status: data.data.status,
      role: data.data.role,
      userCurrentStatus: data.data.userDisplay.userCurrentStatus,
      createdAt: data.data.createdAt,
      updatedAt: data.data.updatedAt,
      lastReadAt: data.data.lastReadAt,
      invitedByProfile: data.data.invitedByProfile,
    };

    return userData;
  } catch (error) {
    console.error("Failed to fetch user data:", error);
    return null;
  }
}
