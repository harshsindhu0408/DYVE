import http from "http";
import app from "./app.js";
import dotenv from "dotenv";
import { initSocket } from "./services/socket.js";
import cors from 'cors';

dotenv.config();

app.use(cors({
  origin: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
}));

app.options("*", cors());

const server = http.createServer(app);

initSocket(server);

// Handle server errors
server.on("error", (error) => {
  console.error("Server error:", error);
});

// Health check endpoints
app.get("/health", (req, res) => {
  res.status(200).json({ status: "Notification service healthy" });
});

app.get("/", (req, res) => {
  res.status(200).json({ status: "Notification service running" });
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
  process.exit(1);
});

// Start the server
server.listen(process.env.PORT || 3001, () => {
  console.log(`Notification service is running on port ${process.env.PORT}`);
});
