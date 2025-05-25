import crypto from "crypto";
import { config } from "../config/config.js";
import jwt from "jsonwebtoken";
import axios from "axios";
import { redis, connectRedis } from "../services/redis.js";

export function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

export const generateOTP = () => {
  return crypto.randomInt(100000, 999999).toString(); // 6-digit OTP
};

export const validatePhone = (phoneNumber) => {
  const indianPhoneRegex = /^(\+91[\-\s]?)?[6789]\d{9}$/;
  return indianPhoneRegex.test(phoneNumber);
};

export const generateTokens = (userId, role, tokenVersion) => {
  const accessToken = jwt.sign(
    { _id: userId, role, tokenVersion },
    config.jwt.accessSecret,
    {
      expiresIn: config.jwt.accessExpiration,
    }
  );

  const refreshToken = jwt.sign(
    { _id: userId, role, tokenVersion },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiration }
  );

  return { accessToken, refreshToken };
};

const channelService = axios.create({
  baseURL: process.env.BASE_URL_CHANNEL,
  timeout: 10000,
});

export const getChannelMembers = async (channelId, socket) => {
  const cacheKey = `channel:members:${channelId}`;
  console.log(`🔍 Checking cache for key: ${cacheKey}`);

  await connectRedis();

  try {
    const cachedMembers = await redis.get(cacheKey);
    if (cachedMembers) {
      console.log(`✅ Cache hit for channel ${channelId}`);
      return JSON.parse(cachedMembers);
    }

    console.log(
      `❌ Cache miss for channel ${channelId}, fetching from service...`
    );

    // Get token from socket's auth data
    const token =
      socket.token ||
      socket.handshake.auth?.token ||
      socket.handshake.query?.token ||
      socket.request.headers?.authorization?.split(" ")[1];



      console.log("here the token is this ----", token);

    if (!token) {
      throw new Error("No authentication token available");
    }

    const response = await channelService.get(`/members/${channelId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-internal-call": "true",
        "x-service-name": "message-service",
      },
    });

    const memberIds = response.data.data.members.map((member) =>
      member.userId.toString()
    );

    if (memberIds.length > 0) {
      console.log(`⬇️ Fetched ${memberIds.length} members, caching...`);
      await redis.setEx(cacheKey, 6000, JSON.stringify(memberIds));
    }

    return memberIds;
  } catch (error) {
    console.error(`Failed to fetch members for channel ${channelId}:`, {
      error: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });
    return [];
  }
};
