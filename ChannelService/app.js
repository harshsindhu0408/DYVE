import dotenv from "dotenv";
import express from "express";
import connectDB from "./db/db.js";
import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";
import swaggerJSDoc from "swagger-jsdoc";
import { eventBus } from "./services/rabbit.js";
import { checkAdminPermission } from "./rpcHandlers/verifyUserRole.service.js";
import { setupRabbit } from "./rpcHandlers/userClient.js";
import { setupEventListeners } from "./services/eventHandlers.js";
import channelRoutes from "./routes/channel.routes.js";
import cors from "cors";
import { connectRedis } from "./services/redis.js";

const app = express();
connectDB();
app.use(cors());
await eventBus.connect();
await setupRabbit();
dotenv.config();
// await checkAdminPermission();
setupEventListeners();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
await connectRedis();

// Swagger definition
const swaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "Channel Management API",
    version: "1.0.0",
    description: "API documentation for managing channels within workspaces.",
  },
  servers: [
    {
      url: "http://localhost:3000/api",
      description: "Development server",
    },
  ],
};

// Options for swagger-jsdoc
const options = {
  swaggerDefinition,
  apis: ['./docs/*.swagger.js' ],
};

// Initialize swagger-jsdoc
const swaggerSpec = swaggerJSDoc(options);

// Use swagger-ui-express for your app documentation endpoint
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use("/", channelRoutes);

export default app;
