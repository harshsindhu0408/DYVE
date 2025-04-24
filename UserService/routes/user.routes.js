import express from "express";
import {
  updateUserProfile,
  getUserProfile,
  deleteUserProfile,
} from "../controllers/user.controller.js";
import { userAuthMiddleware } from "../middlewares/authMiddleWare.js";

const router = express.Router();

router.get("/profile", userAuthMiddleware, getUserProfile);
router.put("/profile", userAuthMiddleware, updateUserProfile);
router.delete("/profile", userAuthMiddleware, deleteUserProfile);

export default router;