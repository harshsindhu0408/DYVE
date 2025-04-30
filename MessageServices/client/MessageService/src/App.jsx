import React, { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import {
  Box,
  Button,
  Container,
  Stack,
  TextField,
  Typography,
  Paper,
  Divider,
} from "@mui/material";

const App = () => {
  const socket = useMemo(
    () =>
      io("http://localhost:3000", {
        withCredentials: true,
      }),
    []
  );

  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [room, setRoom] = useState("");
  const [socketID, setSocketId] = useState("");
  const [roomName, setRoomName] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    socket.emit("message", { message, room });
    setMessage("");
  };

  const joinRoomHandler = (e) => {
    e.preventDefault();
    socket.emit("join-room", roomName);
    setRoomName("");
  };

  useEffect(() => {
    socket.on("connect", () => {
      setSocketId(socket.id);
      console.log("connected", socket.id);
    });

    socket.on("receive-message", (data) => {
      console.log(data);
      setMessages((messages) => [...messages, data]);
    });

    socket.on("welcome", (s) => {
      console.log(s);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Paper elevation={3} sx={{ p: 3, mb: 4 }}>
        <Typography variant="h5" gutterBottom align="center">
          Socket.IO Chat
        </Typography>
        <Typography variant="subtitle2" color="text.secondary" align="center">
          Connected ID: {socketID}
        </Typography>
      </Paper>

      {/* Join Room Section */}
      <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Join Room
        </Typography>
        <form onSubmit={joinRoomHandler}>
          <Stack direction="row" spacing={2}>
            <TextField
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              label="Room Name"
              variant="outlined"
              fullWidth
            />
            <Button type="submit" variant="contained" color="primary">
              Join
            </Button>
          </Stack>
        </form>
      </Paper>

      {/* Message Send Section */}
      <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Send Message
        </Typography>
        <form onSubmit={handleSubmit}>
          <Stack spacing={2}>
            <TextField
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              label="Message"
              variant="outlined"
              fullWidth
            />
            <TextField
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              label="Room"
              variant="outlined"
              fullWidth
            />
            <Button type="submit" variant="contained" color="primary">
              Send
            </Button>
          </Stack>
        </form>
      </Paper>

      {/* Messages Section */}
      <Paper elevation={1} sx={{ p: 2, maxHeight: 300, overflowY: "auto" }}>
        <Typography variant="subtitle1" gutterBottom>
          Messages
        </Typography>
        <Divider sx={{ mb: 2 }} />
        <Stack spacing={1}>
          {messages.map((m, i) => (
            <Typography key={i} variant="body1">
              {m}
            </Typography>
          ))}
        </Stack>
      </Paper>
    </Container>
  );
};

export default App;
