import express from "express";
import cors from "cors";
import { createProxyMiddleware } from "http-proxy-middleware";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());

// Proxy for User Service
app.use(
  "/user",
  createProxyMiddleware({
    target: process.env.BASE_USER,
    changeOrigin: true,
    onError: (err, req, res) => {
      console.error("User Service Proxy error:", err);
      res.status(502).json({
        success: false,
        message: "User service is currently unavailable",
      });
    },
    timeout: 5000, // 5 second timeout
  })
);

app.use(
  "/workspace",
  createProxyMiddleware({
    target: process.env.BASE_WORKSPACE,
    changeOrigin: true,
    onError: (err, req, res) => {
      console.error("Workspace Service Proxy error:", err);
      res.status(502).json({
        success: false,
        message: "Workspace service is currently unavailable",
      });
    },
    timeout: 5000, // 5 second timeout
  })
);

// app.use("/channel", createProxyMiddleware({
//   target: process.env.BASE_CHANNEL,
//   changeOrigin: true,
//   onError: (err, req, res) => {
//     console.error("Workspace Service Proxy error:", err);
//     res.status(502).json({
//       success: false,
//       message: "Workspace service is currently unavailable",
//     });
//   },
//   timeout: 5000, // 5 second timeout
// }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "Gateway healthy" });
});

app.get("/", (req, res) => {
  res.status(200).json({ status: "Server working healthy" });
});

app.listen(3000, () => {
  console.log("Gateway server listening on port 3000");
});

export default app;
