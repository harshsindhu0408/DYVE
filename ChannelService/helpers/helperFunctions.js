import crypto from "crypto";
import { config } from "../config/config.js";
import jwt from "jsonwebtoken";

export function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

export const generateOTP = () => {
  return crypto.randomInt(100000, 999999).toString(); // 6-digit OTP
};

export const validatePhone = (phoneNumber) => {
  const indianPhoneRegex = /^(\+91[\-\s]?)?[6789]\d{9}$/;
  return indianPhoneRegex.test(phoneNumber);
};

export const generateTokens = (userId, role, tokenVersion) => {
  const accessToken = jwt.sign({ _id: userId, role, tokenVersion }, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiration,
  });

  const refreshToken = jwt.sign(
    { _id: userId, role, tokenVersion },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiration }
  );

  return { accessToken, refreshToken };
};
