import express from "express";
import {
  listWorkspaceMembers,
  getWorkspaceMember,
  updateWorkspaceMember,
  removeWorkspaceMember,
} from "../controllers/members.controller.js";
import { userAuthMiddlewareForWorkspace } from "../middlewares/authMiddleWare.js";

const router = express.Router();

router.get(
  "/:workspaceId/members",
  userAuthMiddlewareForWorkspace,
  listWorkspaceMembers
);
router.get(
  "/:workspaceId/members/:userId",
  userAuthMiddlewareForWorkspace,
  getWorkspaceMember
);
router.patch(
  "/:workspaceId/members/:userId",
  userAuthMiddlewareForWorkspace,
  updateWorkspaceMember
);
router.delete(
  "/:workspaceId/members/:userId",
  userAuthMiddlewareForWorkspace,
  removeWorkspaceMember
);

export default router;
