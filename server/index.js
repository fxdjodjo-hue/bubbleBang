"use strict";

const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { RoomManager, sanitizeRoomCode } = require("./RoomManager");

const PORT = Number(process.env.PORT || 3001);
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST"],
  },
});

const publicRoot = path.resolve(__dirname, "..");
app.use(express.static(publicRoot));

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

const rooms = new RoomManager(io);

io.on("connection", (socket) => {
  socket.on("create_room", (payload = {}) => {
    rooms.leaveRoom(socket, true);
    rooms.createRoom(socket, payload.nickname);
  });

  socket.on("join_room", (payload = {}) => {
    rooms.leaveRoom(socket, true);
    rooms.joinRoom(socket, sanitizeRoomCode(payload.roomCode), payload.nickname);
  });

  socket.on("player_input", (payload = {}) => {
    rooms.handleInput(socket, payload);
  });

  socket.on("latency_probe", (_payload = {}, ack) => {
    if (typeof ack === "function") ack({ serverTime: Date.now() });
  });

  socket.on("leave_room", () => {
    rooms.leaveRoom(socket);
  });

  socket.on("restart_room", () => {
    rooms.restartRoom(socket);
  });

  socket.on("disconnect", () => {
    rooms.leaveRoom(socket, true);
  });
});

server.listen(PORT, () => {
  console.log(`Bubble Bang server running at http://localhost:${PORT}`);
});

process.on("SIGINT", () => {
  rooms.stop();
  server.close(() => process.exit(0));
});
