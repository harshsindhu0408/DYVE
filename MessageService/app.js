import dotenv from "dotenv";
import cors from "cors";
import express from "express";
import connectDB from "./db/db.js";
import cookieParser from "cookie-parser";
import { setupUserEventHandlers } from "./services/eventHandlers.js";
import { eventBus } from "./services/rabbit.js";
import { connectRedis } from "./services/redis.js";
import dmRoutes from './routes/dm.routes.js'

const app = express();
app.use(cors());
connectDB();
dotenv.config();
await eventBus.connect();
setupUserEventHandlers();
await connectRedis();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/", dmRoutes);


export default app;
