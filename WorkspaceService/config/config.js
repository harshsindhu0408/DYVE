export const config = {
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || "your-access-secret",
    refreshSecret: process.env.JWT_REFRESH_SECRET || "your-refresh-secret",
    invitationSecret: process.env.JWT_INVITATION_SECRET || "your-invitation-secret",
    accessExpiration: "7d",
    refreshExpiration: "7d",
    refreshExpirationMs: 7 * 24 * 60 * 60 * 1000,
  },
  mongoUri: process.env.MONGO_URL,
  userBaseUrl: process.env.BASE_URL_USER || "http://localhost:3001",
  workspaceBaseUrl: process.env.BASE_URL_WORKSPACE || "http://localhost:3002",
  redisUrl: process.env.REDIS_URL,
  redisPort: process.env.REDIS_PORT || 6379,
  redisHost: process.env.REDIS_HOST || "localhost",
  port: process.env.PORT || 3002,
};
