import ChannelMember from "../models/channelMembers.model";
import { eventBus } from "./rabbit";

// Channel Service (event listener)
export const setupEventListeners = () => {
  // user updated event
  eventBus.subscribe("user:updated", async (message) => {
    const { userId, changes } = message;

    // Update ChannelMember documents
    await ChannelMember.updateMany(
      { userId },
      {
        $set: {
          "userDisplay.name": changes.name,
          "userDisplay.avatar": changes.avatar,
          "userDisplay.status": changes.status,
        },
      }
    );

    // Emit WebSocket events to notify active channel members
    const channels = await ChannelMember.distinct("channelId", { userId });
    channels.forEach((channelId) => {
      wsServer.emit(`channel:${channelId}:member_updated`, { userId, changes });
    });
  });

  // user deleted event
  eventBus.subscribe("user:deleted", async (message) => {
    const { userId } = message;

    // Delete ChannelMember documents
    await ChannelMember.deleteMany({ userId });

    // Emit WebSocket events to notify active channel members
    const channels = await ChannelMember.distinct("channelId", { userId });
    channels.forEach((channelId) => {
      wsServer.emit(`channel:${channelId}:member_deleted`, { userId });
    });
  });
};
