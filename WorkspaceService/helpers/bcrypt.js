import bcrypt from "bcryptjs";
import jwt from 'jsonwebtoken';

export const hashPassword = async (password) => {
  try {
    const saltRounds = parseInt(process.env.SALTROUNDS) || 10;
    const salt = await bcrypt.genSalt(saltRounds);
    return await bcrypt.hash(password, salt);
  } catch (error) {
    console.error("Password hashing error:", error);
    throw new Error("Password hashing failed");
  }
};

export const comparePassword = async (password, hashedPassword) => {
  try {
    return await bcrypt.compare(password, hashedPassword);
  } catch (error) {
    console.error("Password comparison error:", error);
    throw new Error("Password comparison failed");
  }
};