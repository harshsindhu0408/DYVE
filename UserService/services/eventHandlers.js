import { User } from "../models/user.model.js";
import { eventBus } from "./rabbit.js";

export const setupUserEventHandlers = async () => {
  console.log("Initializing user event handlers...");

  try {
    await eventBus.ensureConnection();

    // Existing verification handler
    await setupUserVerification();

    // New data request handler
    await setupUserDataHandler();

    console.log("✅ All user event handlers ready");
  } catch (initError) {
    console.error("❌ Failed to initialize event handlers:", initError);
    setTimeout(setupUserEventHandlers, 5000); // Retry
  }
};

// Existing verification handler (moved to separate function)
async function setupUserVerification() {
  await eventBus.subscribe(
    "user_queries",
    "user_service",
    "user.verify_request",
    async ({ email, correlationId }) => {
      try {
        console.log(`Verification request received for email: ${email}`);

        const user = await User.findOne({ email }).select("_id").lean();

        const verificationResult = {
          email,
          userId: user?._id || null,
          exists: !!user,
          timestamp: new Date(),
          correlationId,
        };

        console.log(`Verification result for ${email}:`, verificationResult);

        await publishWithRetry(
          "user_events",
          "user.verified",
          verificationResult,
          { correlationId }
        );
      } catch (error) {
        console.error(`Error processing verification for ${email}:`, error);
        await handleHandlerError(error, { email, correlationId });
        throw error;
      }
    }
  );
}

// New data handler for sharing user data
async function setupUserDataHandler() {
  await eventBus.subscribe(
    "user_queries",
    "user_service_data",
    "user.data.request",
    async ({ userId, correlationId }) => {
      try {
        console.log(`Data request received for user: ${userId}`);

        const user = await User.findById(userId).lean();
        if (!user) {
          console.warn(`User not found: ${userId}`);
          return;
        }

        // Prepare minimal required user data
        const userData = {
          id: user._id,
          name: user.profile.name,
          email: user.email,
          avatar: user.profile.avatar,
          phone: user.profile.phone,
          bio: user.profile.bio,
          status: user.status,
        };

        

        await publishWithRetry(
          "user_events",
          "user.data.response",
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
}

// Shared utility functions
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
