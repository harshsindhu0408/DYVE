import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const app = express();

// Proxy for User Service
app.use("/user", createProxyMiddleware({
  target: "http://localhost:3001",
  changeOrigin: true,
  onError: (err, req, res) => {
    console.error("User Service Proxy error:", err);
    res.status(502).json({
      success: false,
      message: "User service is currently unavailable",
    });
  },
  timeout: 5000, // 5 second timeout
}));

app.use("/workspace", createProxyMiddleware({
  target: "http://localhost:3002",
  changeOrigin: true,
  onError: (err, req, res) => {
    console.error("User Service Proxy error:", err);
    res.status(502).json({
      success: false,
      message: "Workspace service is currently unavailable",
    });
  },
  timeout: 5000, // 5 second timeout
}));

app.use("/channel", createProxyMiddleware({
  target: "http://localhost:3003",
  changeOrigin: true,
  onError: (err, req, res) => {
    console.error("User Service Proxy error:", err);
    res.status(502).json({
      success: false,
      message: "Workspace service is currently unavailable",
    });
  },
  timeout: 5000, // 5 second timeout
}));


// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "Gateway healthy" });
});

app.listen(3000, () => {
  console.log("Gateway server listening on port 3000");
});

export default app;
