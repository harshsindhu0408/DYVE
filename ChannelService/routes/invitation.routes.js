import express from "express";
import {
  inviteUserByEmail,
  acceptInvite,
  revokeInvite,
  listInvites,
} from "../controllers/invitation.controller.js";
import { userAuthMiddlewareForWorkspace } from "../middlewares/authMiddleWare.js";

const router = express.Router();

router.post("/invite", userAuthMiddlewareForWorkspace, inviteUserByEmail);
router.post("/accept", userAuthMiddlewareForWorkspace, acceptInvite);
router.patch("/profile", userAuthMiddlewareForWorkspace, revokeInvite);
router.get("/invite", userAuthMiddlewareForWorkspace, listInvites);

export default router;
