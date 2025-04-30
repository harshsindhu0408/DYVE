import express from 'express';
import { Server } from 'socket.io';
import { createServer } from 'http';

const app = express();
const PORT = 3000;
const server = createServer(app);

const io = new Server(server, {
    cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST"],
        credentials: true
    }
});

app.get("/", (req, res) => {
    res.send("Hello, World!");
});

io.on("connection", (socket) => {
    console.log("A user connected", socket.id);

    // io.use((socket, next) => {
    //     cookieParser()(socket.request, socket.request.res, (err) => {
    //         if (err) return next(err);

    //         const token = socket.request.cookies.token;
    //         if (!token) return next(new Error("Authentication Error"));

    //         const decoded = jwt.verify(token, secretKeyJWT);
    //         next();
    //     });
    // });

    socket.on("message", ({ room, message }) => {
        console.log(message);
        io.to(room).emit("receive-message", message);
    })

    socket.on("join-room", (room) => {
        socket.join(room);
        console.log(`User joined room ${room}`);
    });

    socket.on("disconnect", () => {
        console.log("User Disconnected", socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
