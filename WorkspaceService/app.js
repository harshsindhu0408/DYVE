import dotenv from "dotenv";
import express from "express";
import connectDB from "./db/db.js";
import workspaceRoutes from "./routes/workspace.routes.js";
import invitationRoutes from "./routes/invitation.routes.js";
import cookieParser from "cookie-parser";
import fileUpload from "express-fileupload";
import { setupUserEventListeners } from "./services/userCache.js";
import { eventBus } from "./services/rabbit.js";
import { setupEventListeners } from "./services/eventHandlers.js";
import { startConsumer } from "./rpcHandlers/index.js";
import workspaceMemberRoutes from "./routes/workspaceMember.routes.js";
import cors from "cors";

dotenv.config();
const app = express();
connectDB();
await eventBus.connect();
setupUserEventListeners();
setupEventListeners();
await startConsumer();
app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/", workspaceRoutes);
app.use("/", invitationRoutes);
app.use("/", workspaceMemberRoutes);

export default app;
