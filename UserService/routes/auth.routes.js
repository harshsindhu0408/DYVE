import express from "express";
import {
  register,
  login,
  sendForgotPaswordOTP,
  verifyForgotPasswordOTP,
  setNewPassword,
  logoutUser,
  sendMagicLoginOTP,
  verifyMagicLoginOTP,
} from "../controllers/auth.controller.js";
import { userAuthMiddleware } from "../middlewares/authMiddleWare.js";

const router = express.Router();

router.post("/auth/register", register);
router.post("/auth/login", login);
router.post("/auth/forgot-password", sendForgotPaswordOTP);
router.post("/auth/verify-otp", verifyForgotPasswordOTP);
router.post("/auth/set-new-password", setNewPassword);
router.post("/auth/logout", userAuthMiddleware, logoutUser);
router.post("/auth/magic", sendMagicLoginOTP);
router.post("/auth/magic/verify", verifyMagicLoginOTP);

export default router;
