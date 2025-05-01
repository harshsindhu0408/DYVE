import express from "express";
import {
  inviteUserByEmail,
  acceptInvite,
  revokeInvitation,
  listInvites,
  getPendingInvitesForUser,
} from "../controllers/invitation.controller.js";
import { userAuthMiddlewareForWorkspace } from "../middlewares/authMiddleWare.js";

const router = express.Router();

router.post(
  "/invite/:workspaceId",
  userAuthMiddlewareForWorkspace,
  inviteUserByEmail
);
router.post(
  "/:slug/accept-public-invite",
  userAuthMiddlewareForWorkspace,
  acceptInvite
);
router.patch(
  "/revoke/:inviteId",
  userAuthMiddlewareForWorkspace,
  revokeInvitation
);
router.get("/invite/:workspaceId", userAuthMiddlewareForWorkspace, listInvites);


router.get(
  "/user/pending", 
  userAuthMiddlewareForWorkspace, // General auth middleware instead of workspace-specific
  getPendingInvitesForUser
);

export default router;
