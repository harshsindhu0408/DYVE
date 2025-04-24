import { User } from "../models/user.model.js";
import { eventBus } from "./rabbit.js";

export const setupUserVerification = () => {
  console.log("User verification runnung ✅");
  eventBus.subscribe(
    'user_queries',
    'user_service',
    'user.verify_request',
    async ({ email }) => {
      const user = await User.findOne({ email });
      
      await eventBus.publish(
        'user_events',
        'user.verified',
        {
          email,
          userId: user?._id || null,
          exists: !!user
        }
      );
    }
  );
};
