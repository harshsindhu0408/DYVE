import dotenv from "dotenv";
import express from "express";
import connectDB from "./db/db.js";
import cookieParser from "cookie-parser";
import { eventBus } from "./services/rabbit.js";
import { checkAdminPermission } from "./rpcHandlers/verifyUserRole.service.js";
import { setupRabbit } from "./rpcHandlers/userClient.js";
import { setupEventListeners } from "./services/eventHandlers.js";
import channelRoutes from "./routes/channel.routes.js";

const app = express();
connectDB();
app.use(cors());
await eventBus.connect();
await setupRabbit();
dotenv.config();
await checkAdminPermission();
setupEventListeners();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());



app.use("/", channelRoutes);

export default app;
