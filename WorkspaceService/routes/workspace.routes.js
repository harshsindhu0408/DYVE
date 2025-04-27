import express from "express";
import {
  createWorkspace,
  listWorkspaces,
  updateWorkspace,
  getWorkspace,
  deleteWorkspace,
  updateWorkspaceLogo,
} from "../controllers/workspace.controller.js";
import { workspaceLogoUpload } from "../services/fileUpload.service.js";
import { userAuthMiddlewareForWorkspace } from "../middlewares/authMiddleWare.js";

const router = express.Router();

router.post(
  "/",
  userAuthMiddlewareForWorkspace,
  workspaceLogoUpload.single("logo"),
  createWorkspace
);
router.get("/", userAuthMiddlewareForWorkspace, listWorkspaces);
router.get("/:slug", userAuthMiddlewareForWorkspace, getWorkspace);
router.patch("/:slug", userAuthMiddlewareForWorkspace, updateWorkspace);
router.delete("/:slug", userAuthMiddlewareForWorkspace, deleteWorkspace);
router.patch(
  "/:slug/logo",
  userAuthMiddlewareForWorkspace,
  workspaceLogoUpload.single("logo"),
  updateWorkspaceLogo
);

export default router;
