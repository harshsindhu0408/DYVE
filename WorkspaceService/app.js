import dotenv from "dotenv";
import express from "express";
import connectDB from "./db/db.js";
import workspaceRoutes from './routes/workspace.routes.js';
import cookieParser from "cookie-parser";
import fileUpload from "express-fileupload";
import { setupUserEventListeners } from "./services/userCache.js";
import { eventBus } from "./services/rabbit.js";
import { setupEventListeners } from "./services/eventHandlers.js";
import { startConsumer } from "./rpcHandlers/index.js";

const app = express();
connectDB();
await eventBus.connect();
setupUserEventListeners();
setupEventListeners();
await startConsumer();
dotenv.config();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  fileUpload({
    useTempFiles: true,
    tempFileDir: "/tmp/",
  })
);

app.use("/", workspaceRoutes);

export default app;
