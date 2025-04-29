import http from "http";
import app from "./app.js";
import dotenv from "dotenv";
dotenv.config();


const server = http.createServer(app);

// Handle server errors
server.on("error", (error) => {
  console.error("Server error:", error);
});

app.get("/", (req, res) => {
  res.status(200).json({ status: "Workspace service running" });
});
app.get("/health", (req, res) => {
  res.status(200).json({ status: "Workspace service healthy" });
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
  process.exit(1);
});

server.listen(process.env.PORT || 3001, () => {
  console.log(`Workspace service is running on port ${process.env.PORT}`);
});
