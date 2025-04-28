require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const { initSocket } = require('./socketServer');
const { connectDB } = require('./config/db');
const app = express();
const server = http.createServer(app);

// Middleware
app.use(express.json());
app.use(cors());
app.use(helmet());

// DB Connection
connectDB();

// Routes
app.use('/api', require('./routes/channelRoutes'));
app.use('/api', require('./routes/threadRoutes'));
app.use('/api', require('./routes/dmRoutes'));

// WebSocket Initialization
initSocket(server);

// Server Start
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
