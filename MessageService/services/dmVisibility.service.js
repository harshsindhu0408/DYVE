import { DMConversation } from "../models/dm.model.js";
import { eventBus } from "./rabbit.js";
import { redis } from "./redis.js";

const CACHE_TTL = 60 * 5; // 5 minutes cache
const REQUEST_TIMEOUT = 2500; // Reduced from 3s to 2.5s

export const getUsersForDmList = async (userId, workspaceId) => {
  const cacheKey = `dm_users:${workspaceId}:${userId}`;
  
  try {
    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // Parallel fetch with individual timeouts
    const [channelMembers, existingDmUsers] = await Promise.all([
      getUsersFromSharedPrivateChannels(userId, workspaceId),
      getExistingDmUsers(userId, workspaceId),
    ]);

    // Deduplicate and filter
    const uniqueUsers = [...new Set([...channelMembers, ...existingDmUsers])];
    
    // Cache the result
    await redis.set(cacheKey, JSON.stringify(uniqueUsers), 'EX', CACHE_TTL);
    
    return uniqueUsers;
  } catch (error) {
    console.error("Error in getUsersForDmList:", error);
    return []; // Fail gracefully
  }
};

const getUsersFromSharedPrivateChannels = async (userId, workspaceId) => {
  try {
    const response = await eventBus.request(
      "channel_queries",
      "channel.shared_private_members.request",
      { userId, workspaceId },
      { timeout: REQUEST_TIMEOUT }
    );
    return response?.members?.map(m => m.userId) || []; // Extract just user IDs
  } catch (error) {
    console.error("Channel service fallback to cache:", error);
  
  }
};

const getExistingDmUsers = async (userId, workspaceId) => {
  try {
    const conversations = await DMConversation.find({
      "participants.userId": userId,
      "participants.isActive": true,
      workspaceId,
    }).distinct("participants.userId");

    return conversations.filter((id) => id.toString() !== userId.toString());
  } catch (error) {
    console.error("Error fetching existing DM users:", error);
    return [];
  }
};
