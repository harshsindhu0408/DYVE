import Channel from "../models/channel.model.js";
import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../Utils/responseUtils.js";
import ChannelMember from "../models/channelMembers.model.js";

// tested
export const createChannel = async (req, res) => {
  try {
    const {
      workspaceId,
      channelId,
      name,
      description,
      type = "public",
      workspaceName,
      isGeneral = false,
      topic,
      customSettings,
    } = req.body;

    // Validate required fields
    if (!workspaceId || !name || !workspaceName) {
      return sendErrorResponse(
        res,
        400,
        "CHANNEL_CREATION_VALIDATION_ERROR",
        "Missing required fields: workspaceId, name, or workspaceName"
      );
    }

    // Validate authenticated user
    if (!req.user || !req.user._id) {
      return sendErrorResponse(
        res,
        401,
        "UNAUTHORIZED",
        "User authentication required to create channel"
      );
    }

    // Check if channel with same name already exists in this workspace
    const existingChannel = await Channel.findOne({
      workspaceId,
      name: { $regex: new RegExp(`^${name}$`, "i") }, // Case-insensitive match
      isArchived: false,
    });

    if (existingChannel) {
      return sendErrorResponse(
        res,
        409,
        "CHANNEL_ALREADY_EXISTS",
        "A channel with this name already exists in the workspace",
        {
          existingChannel: {
            _id: existingChannel._id,
            name: existingChannel.name,
            type: existingChannel.type,
          },
        }
      );
    }

    const channelData = {
      workspaceId,
      channelId,
      name,
      description,
      type,
      createdBy: {
        userId: req.user._id,
        name: req.user.profile.name,
        avatar: req.user.profile.avatar,
        status: req.user.status || "active",
        bio: req.user.profile.bio,
      },
      workspaceName,
      isGeneral,
      topic,
      customSettings: {
        allowThreads: customSettings?.allowThreads ?? true,
        sendWelcomeMessages: customSettings?.sendWelcomeMessages ?? true,
        defaultNotificationPref:
          customSettings?.defaultNotificationPref || "all",
      },
    };

    // Create and save the new channel
    const newChannel = await Channel.create(channelData);

    // Automatically add creator as channel member
    await ChannelMember.create({
      channelId: newChannel._id,
      userId: req.user._id,
      userDisplay: {
        name: req.user.profile.name,
        avatar: req.user.profile.avatar,
        status: req.user.status || "active",
        bio: req.user.profile.bio,
      },
      role: "owner",
      lastReadAt: new Date(),
      notificationPref: customSettings?.defaultNotificationPref || "all",
      joinedAt: new Date(),
    });

    return sendSuccessResponse(
      res,
      201,
      "CHANNEL_CREATED",
      "Channel created successfully with creator added as member",
      {
        channel: newChannel,
        membership: {
          userId: req.user._id,
          role: isGeneral ? "owner" : "admin",
          status: "active",
        },
      }
    );
  } catch (error) {
    // Error handling remains the same as before
    if (
      error.code === 11000 &&
      error.keyPattern?.name &&
      error.keyPattern?.workspaceId
    ) {
      return sendErrorResponse(
        res,
        409,
        "CHANNEL_ALREADY_EXISTS",
        "A channel with this name already exists in the workspace",
        { conflictKey: error.keyValue }
      );
    }

    if (error.name === "ValidationError") {
      const validationMessages = Object.values(error.errors).map(
        (err) => err.message
      );
      return sendErrorResponse(
        res,
        400,
        "CHANNEL_VALIDATION_ERROR",
        "Validation failed for one or more fields",
        validationMessages
      );
    }

    console.error("Create Channel Error:", error);
    return sendErrorResponse(
      res,
      500,
      "CHANNEL_CREATION_FAILED",
      "An internal server error occurred while creating the channel",
      error.message
    );
  }
};

// tested
export const updateChannel = async (req, res) => {
  try {
    const { channelId } = req.params;

    if (!channelId) {
      return sendErrorResponse(
        res,
        400,
        "CHANNEL_ID_REQUIRED",
        "Channel ID is required",
        null
      );
    }

    const {
      name,
      description,
      type,
      topic,
      customSettings,
      isArchived,
      workspaceId,
    } = req.body;

    // Validate workspaceId is provided
    if (!workspaceId) {
      return sendErrorResponse(
        res,
        400,
        "WORKSPACE_ID_REQUIRED",
        "Workspace ID is required",
        null
      );
    }

    const updateData = {};

    if (name !== undefined) {
      // Check if channel with new name already exists in the same workspace
      const existingChannel = await Channel.findOne({
        workspaceId,
        name: { $regex: new RegExp(`^${name}$`, "i") }, // Case-insensitive match
        _id: { $ne: channelId }, // Exclude current channel from check
        isArchived: false,
      });

      if (existingChannel) {
        return sendErrorResponse(
          res,
          409,
          "CHANNEL_NAME_EXISTS",
          "A channel with this name already exists in the workspace",
          {
            existingChannel: {
              _id: existingChannel._id,
              name: existingChannel.name,
            },
          }
        );
      }

      updateData.name = name;
    }

    if (description !== undefined) updateData.description = description;
    if (type !== undefined) updateData.type = type;
    if (topic !== undefined) updateData.topic = topic;
    if (customSettings !== undefined)
      updateData.customSettings = customSettings;
    if (isArchived !== undefined) updateData.isArchived = isArchived;

    // Fetch the channel and apply changes
    const channelToUpdate = await Channel.findById(channelId);
    if (!channelToUpdate) {
      return sendErrorResponse(
        res,
        404,
        "CHANNEL_NOT_FOUND",
        "Channel not found",
        { channelId }
      );
    }

    // Apply updates manually to trigger any `pre('save')` hooks
    Object.assign(channelToUpdate, updateData);

    await channelToUpdate.save();

    return sendSuccessResponse(
      res,
      200,
      "CHANNEL_UPDATED",
      "Channel updated successfully",
      channelToUpdate
    );
  } catch (error) {
    // Handle duplicate key error (fallback check)
    if (error.code === 11000) {
      return sendErrorResponse(
        res,
        409,
        "CHANNEL_UPDATE_CONFLICT",
        "A channel with this name already exists in the workspace",
        { conflictKey: error.keyValue }
      );
    }

    // Mongoose validation errors
    if (error.name === "ValidationError") {
      const validationMessages = Object.values(error.errors).map(
        (err) => err.message
      );
      return sendErrorResponse(
        res,
        400,
        "CHANNEL_UPDATE_VALIDATION_ERROR",
        "Validation failed for one or more fields",
        validationMessages
      );
    }

    console.error("Update Channel Error:", error);
    return sendErrorResponse(
      res,
      500,
      "CHANNEL_UPDATE_FAILED",
      "An internal server error occurred while updating the channel",
      error.message
    );
  }
};

// tested
export const getChannelById = async (req, res) => {
  try {
    const { channelId } = req.params;

    if (!channelId) {
      return sendErrorResponse(
        res,
        400,
        "CHANNEL_ID_REQUIRED",
        "Channel ID is required",
        null
      );
    }

    const channel = await Channel.findById(channelId);
    if (!channel) {
      return sendErrorResponse(
        res,
        404,
        "CHANNEL_NOT_FOUND",
        "Channel not found",
        { channelId }
      );
    }

    return sendSuccessResponse(
      res,
      200,
      "CHANNEL_FOUND",
      "Channel retrieved successfully",
      channel
    );
  } catch (error) {
    console.error("Get Channel Error:", error);

    return sendErrorResponse(
      res,
      500,
      "CHANNEL_RETRIEVAL_FAILED",
      "An internal server error occurred while retrieving the channel",
      error.message
    );
  }
};

// tested
export const getChannelsByWorkspaceId = async (req, res) => {
  try {
    const { workspaceId } = req.params;

    if (!workspaceId) {
      return sendErrorResponse(
        res,
        400,
        "WORKSPACE_ID_REQUIRED",
        "Workspace ID is required",
        null
      );
    }

    const channels = await Channel.find({ workspaceId });
    if (!channels || channels.length === 0) {
      return sendErrorResponse(
        res,
        404,
        "CHANNELS_NOT_FOUND",
        "No channels found for this workspace",
        { workspaceId }
      );
    }

    return sendSuccessResponse(
      res,
      200,
      "CHANNELS_FOUND",
      "Channels retrieved successfully",
      channels
    );
  } catch (error) {
    console.error("Get Channels Error:", error);

    return sendErrorResponse(
      res,
      500,
      "CHANNELS_RETRIEVAL_FAILED",
      "An internal server error occurred while retrieving the channels",
      error.message
    );
  }
};

export const getAllChannels = async (req, res) => {
  try {
    const channels = await Channel.find();
    if (!channels || channels.length === 0) {
      return sendErrorResponse(
        res,
        404,
        "CHANNELS_NOT_FOUND",
        "No channels found",
        null
      );
    }

    return sendSuccessResponse(
      res,
      200,
      "CHANNELS_FOUND",
      "Channels retrieved successfully",
      channels
    );
  } catch (error) {
    console.error("Get All Channels Error:", error);

    return sendErrorResponse(
      res,
      500,
      "CHANNELS_RETRIEVAL_FAILED",
      "An internal server error occurred while retrieving the channels",
      error.message
    );
  }
};

// tested
export const getChannelsByUserId = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return sendErrorResponse(
        res,
        400,
        "USER_ID_REQUIRED",
        "User ID is required",
        null
      );
    }

    const channels = await Channel.find({ userId: userId });
    if (!channels || channels.length === 0) {
      return sendErrorResponse(
        res,
        404,
        "CHANNELS_NOT_FOUND",
        "No channels found for this user",
        { userId }
      );
    }

    return sendSuccessResponse(
      res,
      200,
      "CHANNELS_FOUND",
      "Channels retrieved successfully",
      channels
    );
  } catch (error) {
    console.error("Get Channels by User ID Error:", error);

    return sendErrorResponse(
      res,
      500,
      "CHANNELS_RETRIEVAL_FAILED",
      "An internal server error occurred while retrieving the channels",
      error.message
    );
  }
};

// tested
export const getChannelsByType = async (req, res) => {
  try {
    const { type } = req.params;

    if (!type) {
      return sendErrorResponse(
        res,
        400,
        "CHANNEL_TYPE_REQUIRED",
        "Channel type is required",
        null
      );
    }

    const channels = await Channel.find({ type });
    if (!channels || channels.length === 0) {
      return sendErrorResponse(
        res,
        404,
        "CHANNELS_NOT_FOUND",
        "No channels found for this type",
        { type }
      );
    }

    return sendSuccessResponse(
      res,
      200,
      "CHANNELS_FOUND",
      "Channels retrieved successfully",
      channels
    );
  } catch (error) {
    console.error("Get Channels by Type Error:", error);

    return sendErrorResponse(
      res,
      500,
      "CHANNELS_RETRIEVAL_FAILED",
      "An internal server error occurred while retrieving the channels",
      error.message
    );
  }
};

// tested
export const getChannelsByName = async (req, res) => {
  try {
    const { name } = req.params;

    if (!name) {
      return sendErrorResponse(
        res,
        400,
        "CHANNEL_NAME_REQUIRED",
        "Channel name is required",
        null
      );
    }

    const channels = await Channel.find({ name });
    if (!channels || channels.length === 0) {
      return sendErrorResponse(
        res,
        404,
        "CHANNELS_NOT_FOUND",
        "No channels found with this name",
        { name }
      );
    }

    return sendSuccessResponse(
      res,
      200,
      "CHANNELS_FOUND",
      "Channels retrieved successfully",
      channels
    );
  } catch (error) {
    console.error("Get Channels by Name Error:", error);

    return sendErrorResponse(
      res,
      500,
      "CHANNELS_RETRIEVAL_FAILED",
      "An internal server error occurred while retrieving the channels",
      error.message
    );
  }
};

// tested
export const deleteChannel = async (req, res) => {
  try {
    const { channelId } = req.params;
    console.log("channelId - ", channelId);

    if (!channelId) {
      return sendErrorResponse(
        res,
        400,
        "CHANNEL_ID_REQUIRED",
        "Channel ID is required",
        null
      );
    }

    // Use _id instead of channelId in the query
    const deletedChannel = await Channel.findByIdAndDelete(channelId);

    if (!deletedChannel) {
      return sendErrorResponse(
        res,
        404,
        "CHANNEL_NOT_FOUND",
        "Channel not found",
        { channelId }
      );
    }

    // Optionally: Delete all related channel members
    await ChannelMember.deleteMany({ channelId: deletedChannel._id });

    return sendSuccessResponse(
      res,
      200,
      "CHANNEL_DELETED",
      "Channel deleted successfully",
      deletedChannel
    );
  } catch (error) {
    console.error("Delete Channel Error:", error);

    // Handle invalid ID format
    if (error.name === "CastError") {
      return sendErrorResponse(
        res,
        400,
        "INVALID_CHANNEL_ID",
        "Invalid channel ID format",
        { channelId: req.params.channelId }
      );
    }

    return sendErrorResponse(
      res,
      500,
      "CHANNEL_DELETION_FAILED",
      "An internal server error occurred while deleting the channel",
      error.message
    );
  }
};

//tested
export const archiveChannel = async (req, res) => {
  try {
    const { channelId } = req.params;
    console.log("Archiving channel with ID:", channelId);

    if (!channelId) {
      return sendErrorResponse(
        res,
        400,
        "CHANNEL_ID_REQUIRED",
        "Channel ID is required"
      );
    }

    // Update the channel's isArchived field to true
    const updatedChannel = await Channel.findByIdAndUpdate(
      channelId,
      { isArchived: true },
      { new: true }
    );

    if (!updatedChannel) {
      return sendErrorResponse(
        res,
        404,
        "CHANNEL_NOT_FOUND",
        "Channel not found",
        { channelId }
      );
    }

    return sendSuccessResponse(
      res,
      200,
      "CHANNEL_ARCHIVED",
      "Channel archived successfully",
      updatedChannel
    );
  } catch (error) {
    console.error("Archive Channel Error:", error);

    // Handle invalid ID format
    if (error.name === "CastError") {
      return sendErrorResponse(
        res,
        400,
        "INVALID_CHANNEL_ID",
        "Invalid channel ID format",
        { channelId: req.params.channelId }
      );
    }

    return sendErrorResponse(
      res,
      500,
      "CHANNEL_ARCHIVE_FAILED",
      "An internal server error occurred while archiving the channel",
      error.message
    );
  }
};

export const getMyChannels = async (req, res) => {
  try {
    // Validate authenticated user and workspace ID
    if (!req.user || !req.user._id) {
      return sendErrorResponse(
        res,
        401,
        "UNAUTHORIZED",
        "User authentication required"
      );
    }

    const { workspaceId } = req.params; // Get workspaceId from URL params
    if (!workspaceId) {
      return sendErrorResponse(
        res,
        400,
        "WORKSPACE_ID_REQUIRED",
        "Workspace ID is required"
      );
    }

    const userId = req.user._id;

    // Find all channel memberships for this user in the specified workspace
    const memberships = await ChannelMember.find({ userId })
      .populate({
        path: "channel",
        match: {
          isArchived: false,
          workspaceId: workspaceId,
        },
      })
      .sort({ "channel.isGeneral": -1, "channel.name": 1 });

    // Filter out any memberships where channel is null (archived channels or wrong workspace)
    const validMemberships = memberships.filter((m) => m.channel !== null);

    if (validMemberships.length === 0) {
      return sendSuccessResponse(
        res,
        200,
        "NO_CHANNELS_FOUND",
        "You are not a member of any active channels in this workspace",
        []
      );
    }

    // Format the response
    const channels = validMemberships.map((membership) => ({
      ...membership.channel.toObject(),
      membership: {
        role: membership.role,
        joinedAt: membership.joinedAt,
        lastReadAt: membership.lastReadAt,
        notificationPref: membership.notificationPref,
        isMuted: membership.isMuted,
        unreadCount: membership.unreadCount,
        starred: membership.starred,
      },
    }));

    return sendSuccessResponse(
      res,
      200,
      "USER_CHANNELS_FOUND",
      "User's channels in workspace retrieved successfully",
      channels
    );
  } catch (error) {
    console.error("Get User Channels Error:", error);
    return sendErrorResponse(
      res,
      500,
      "CHANNELS_RETRIEVAL_FAILED",
      "An internal server error occurred while retrieving user's channels",
      error.message
    );
  }
};
