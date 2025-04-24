import dotenv from "dotenv";
import express from "express";
import connectDB from "./db/db.js";
import invitationRoutes from "./routes/invitation.routes.js";
import cookieParser from "cookie-parser";
import fileUpload from "express-fileupload";
import { setupUserEventListeners } from "./services/userCache.js";
import { eventBus } from "./services/rabbit.js";
import { checkAdminPermission } from "./rpcHandlers/verifyUserRole.service.js";
import { setupRabbit } from "./rpcHandlers/userClient.js";
import { setupEventListeners } from "./services/eventHandlers.js";

const app = express();
connectDB();
await eventBus.connect();
await setupRabbit();
setupUserEventListeners();
dotenv.config();
await checkAdminPermission();
setupEventListeners();


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  fileUpload({
    useTempFiles: true,
    tempFileDir: "/tmp/",
  })
);

app.use("/", invitationRoutes);

export default app;
