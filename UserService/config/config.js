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
  port: process.env.PORT || 3001,
};
