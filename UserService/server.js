import http from "http";
import app from "./app.js";
import dotenv from "dotenv";
dotenv.config();


const server = http.createServer(app);

// Handle server errors
server.on("error", (error) => {
  console.error("Server error:", error);
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "User service healthy" });
});

app.get("/", (req, res) => {
  res.status(200).json({ status: "User service running" });
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
  process.exit(1);
});

server.listen(process.env.PORT || 3001, () => {
  console.log(`User service is running on port ${process.env.PORT}`);
});
