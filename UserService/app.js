import dotenv from "dotenv";
import express from "express";
import connectDB from "./db/db.js";
import amqp from "amqplib";
import userRoutes from "./routes/user.routes.js";
import authRoutes from "./routes/auth.routes.js";
import cookieParser from "cookie-parser";
import fileUpload from "express-fileupload";
import { setupUserVerification } from "./services/eventHandlers.js";
import { eventBus } from "./services/rabbit.js";
import {  startUserRpcHandler } from "./rpcHandlers/getUserInfo.js";


const app = express();
connectDB();
dotenv.config();
await eventBus.connect();

setupUserVerification();
await startUserRpcHandler();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  fileUpload({
    useTempFiles: true,
    tempFileDir: "/tmp/",
  })
);

app.use("/", userRoutes);
app.use("/", authRoutes);

export default app;
