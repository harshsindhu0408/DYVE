import dotenv from "dotenv";
import cors from "cors";
import express from "express";
import connectDB from "./db/db.js";
import cookieParser from "cookie-parser";
import { eventBus } from "./services/rabbit.js";
import { connectRedis } from "./services/redis.js";

const app = express();
app.use(cors({
  origin: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
}));

app.options("*", cors());
connectDB();
dotenv.config();
await eventBus.connect();
// await setupUserEventHandlers();
await connectRedis();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// app.use("/", dmRoutes);


export default app;
