import Channel from "../models/channel.model.js";
import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../Utils/responseUtils.js";

export const createChannel = async (req, res) => {
  try {
    const {
      workspaceId,
      channelId,
      name,
      description,
      type,
      createdBy,
      workspaceName,
      isGeneral = false,
      topic,
      customSettings,
    } = req.body;

    // Step 1: Validate required fields
    if (
      !workspaceId ||
      !name ||
      !createdBy?.userId ||
      !createdBy?.name ||
      !workspaceName
    ) {
      return sendErrorResponse(
        res,
        400,
        "CHANNEL_CREATION_VALIDATION_ERROR",
        "Missing required fields: workspaceId, name, createdBy, or workspaceName",
        { workspaceId, name, createdBy, workspaceName }
      );
    }

    // Step 2: Construct channel payload
    const channelData = {
      workspaceId,
      channelId,
      name,
      description,
      type,
      createdBy,
      workspaceName,
      isGeneral,
      topic,
      customSettings,
    };

    // Step 3: Create and save the new channel
    const newChannel = new Channel(channelData);
    await newChannel.save();

    return sendSuccessResponse(
      res,
      201,
      "CHANNEL_CREATED",
      "Channel created successfully",
      newChannel
    );
  } catch (error) {
    if (
      error.code === 11000 &&
      error.keyPattern?.slug &&
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

    // Mongoose validation errors
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

    // Unknown server error
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

    const { name, description, type, topic, customSettings, isArchived } =
      req.body;

    const updateData = {};

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (type !== undefined) updateData.type = type;
    if (topic !== undefined) updateData.topic = topic;
    if (customSettings !== undefined)
      updateData.customSettings = customSettings;
    if (isArchived !== undefined) updateData.isArchived = isArchived;

    // Fetch the channel and apply changes
    const updatedChannel = await Channel.findById(channelId);
    if (!updatedChannel) {
      return sendErrorResponse(
        res,
        404,
        "CHANNEL_NOT_FOUND",
        "Channel not found",
        { channelId }
      );
    }

    // Apply updates manually to trigger any `pre('save')` hooks like slug generation
    Object.assign(updatedChannel, updateData);

    await updatedChannel.save();

    return sendSuccessResponse(
      res,
      200,
      "CHANNEL_UPDATED",
      "Channel updated successfully",
      updatedChannel
    );
  } catch (error) {
    // Handle duplicate slug error (from name change)
    if (
      error.code === 11000 &&
      error.keyPattern?.slug &&
      error.keyPattern?.workspaceId
    ) {
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

    const channels = await Channel.find({ "createdBy.userId": userId });
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


export const deleteChannel = async (req, res) => {
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

    const deletedChannel = await Channel.findOneAndDelete({ channelId });

    if (!deletedChannel) {
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
      "CHANNEL_DELETED",
      "Channel deleted successfully",
      deletedChannel
    );
  } catch (error) {
    console.error("Delete Channel Error:", error);

    return sendErrorResponse(
      res,
      500,
      "CHANNEL_DELETION_FAILED",
      "An internal server error occurred while deleting the channel",
      error.message
    );
  }
};
