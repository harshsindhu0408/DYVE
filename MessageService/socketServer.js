const { Server } = require('socket.io');
const redis = require('./config/redis');

let io;

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*",  // Adjust for production
    },
  });

  io.on('connection', (socket) => {
    console.log('New client connected');

    // Join room examples
    socket.on('join', (roomId) => {
      socket.join(roomId);
    });

    require('./sockets/messageEvents')(socket, io);
  });

  // Redis pub/sub handling for multi-instance scaling if needed
};

module.exports = { initSocket, io };
