import express from "express";
import {
  createChannel,
  updateChannel,
  getChannelById,
  getChannelsByWorkspaceId,
  getAllChannels,
  getChannelsByUserId,
  getChannelsByType,
  getChannelsByName,
  deleteChannel,
} from "../controllers/channel.controller.js";

const router = express.Router();

router.post("/createchannel", createChannel);  //create

router.put("/:channelId", updateChannel); //update

router.get("/:channelId", getChannelById);  // get channel by id

router.get("/workspace/:workspaceId", getChannelsByWorkspaceId); // get all channels in a workspace by id

router.get("/", getAllChannels); // get all channels

router.get("/user/:userId", getChannelsByUserId); // Get all channels created by a specific user

router.get("/type/:type", getChannelsByType); // Get all channels of a specific type

router.get("/name/:name", getChannelsByName); // Get all channels with a specific name

router.delete("/:channelId", deleteChannel); // Delete a channel by ID

export default router;