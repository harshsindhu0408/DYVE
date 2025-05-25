import { redis, connectRedis } from "../services/redis.js";
import { requestUserData } from "../services/userAccess.js";

export const getCachedUserRole = async (userId, workspaceId, token) => {
  const cacheKey = `workspace:role:${workspaceId}:${userId}`;
  console.log(`🔍 Checking cache for key: ${cacheKey}`);

  await connectRedis();

  let role = await redis.get(cacheKey);

  if (role) {
    console.log(`✅ Cache hit for key: ${cacheKey}, role: ${role}`);
    return role;
  }

  console.log(`❌ Cache miss for key: ${cacheKey}, fetching from service...`);

  const userData = await requestUserData(userId, workspaceId, token);
  console.log("user data inside the message service is ---- ", userData);
  role = userData?.role;

  if (userData?.role) {
    console.log(`⬇️ Fetched role from service: ${role}, caching it...`);
    await redis.setEx(cacheKey, 600, role);
  } else {
    console.warn(
      `⚠️ No role found for user ${userId} in workspace ${workspaceId}`
    );
  }

  return role;
};