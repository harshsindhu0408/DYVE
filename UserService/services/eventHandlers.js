import { User } from "../models/user.model.js";
import { eventBus } from "./rabbit.js";

export const setupUserVerification = async () => {
  console.log("Initializing user verification handler...");

  try {
    // Ensure we're connected before setting up subscriptions
    await eventBus.ensureConnection();

    await eventBus.subscribe(
      "user_queries",
      "user_service",
      "user.verify_request",
      async ({ email, correlationId }) => {
        // Added correlationId for tracing
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

          // Retry logic for publishing
          let attempts = 0;
          const maxAttempts = 3;

          while (attempts < maxAttempts) {
            try {
              await eventBus.publish(
                "user_events",
                "user.verified",
                verificationResult,
                { correlationId } // Pass correlationId to maintain context
              );
              console.log(`Verification published for ${email}`);
              break;
            } catch (publishError) {
              attempts++;
              console.error(
                `Publish attempt ${attempts} failed for ${email}:`,
                publishError
              );

              if (attempts >= maxAttempts) {
                console.error(`Max publish attempts reached for ${email}`);
                // Consider logging to a dead letter queue or database for later processing
                await logFailedVerification(verificationResult, publishError);
                throw publishError;
              }

              // Exponential backoff
              await new Promise((resolve) =>
                setTimeout(resolve, Math.pow(2, attempts) * 1000)
              );
            }
          }
        } catch (handlerError) {
          console.error(
            `Error processing verification for ${email}:`,
            handlerError
          );

          // Publish error event if possible
          try {
            await eventBus.publish("user_errors", "user.verification_error", {
              email,
              error: handlerError.message,
              timestamp: new Date(),
              correlationId,
            });
          } catch (errorPublishError) {
            console.error("Failed to publish error event:", errorPublishError);
          }

          // Re-throw to trigger nack if needed
          throw handlerError;
        }
      }
    );

    console.log("✅ User verification handler ready");
  } catch (initError) {
    console.error(
      "❌ Failed to initialize user verification handler:",
      initError
    );

    // Implement retry logic for handler setup
    setTimeout(() => {
      console.log("Retrying verification handler setup...");
      setupUserVerification();
    }, 5000);
  }
};

// Optional: Store failed verifications for later processing
async function logFailedVerification(data, error) {
  try {
    // Implement your logging mechanism here
    // Could be a database collection, file log, or external service
    console.error("Storing failed verification:", { data, error });
  } catch (logError) {
    console.error("Failed to log failed verification:", logError);
  }
}
