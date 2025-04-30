import redis from "../services/redis.js";
import { requestUserData } from "../services/userAccess.js";

export const getCachedUserRole = async (userId, workspaceId) => {
  const cacheKey = `workspace:role:${workspaceId}:${userId}`;
  console.log(`🔍 Checking cache for key: ${cacheKey}`);

  let role = await redis.get(cacheKey);

  if (role) {
    console.log(`✅ Cache hit for key: ${cacheKey}, role: ${role}`);
    return role;
  }

  console.log(`❌ Cache miss for key: ${cacheKey}, fetching from service...`);

  const userData = await requestUserData(userId, workspaceId);
  role = userData?.role;

  if (role) {
    console.log(`⬇️ Fetched role from service: ${role}, caching it...`);
    await redis.setex(cacheKey, 600, role); // TTL: 10 mins
  } else {
    console.warn(
      `⚠️ No role found for user ${userId} in workspace ${workspaceId}`
    );
  }

  return role;
};
