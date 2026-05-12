"use strict";

const GameRoom = require("./GameRoom");
const { ROOM_IDLE_MS } = require("./config");

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function sanitizeNickname(nickname) {
  const cleaned = String(nickname || "Player")
    .replace(/[^\w .-]/g, "")
    .trim()
    .slice(0, 16);
  return cleaned || "Player";
}

function sanitizeRoomCode(roomCode) {
  return String(roomCode || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
    this.cleanupTimer = setInterval(() => this.cleanupInactiveRooms(), 60 * 1000);
  }

  createRoom(socket, nickname) {
    const code = this.createUniqueCode();
    const room = new GameRoom(this.io, code, (roomCode) => this.deleteRoom(roomCode));
    this.rooms.set(code, room);
    const player = room.addPlayer(socket.id, sanitizeNickname(nickname));
    socket.join(code);
    socket.data.roomCode = code;
    socket.emit("room_created", { roomCode: code, playerId: player.id });
    room.broadcastWaiting();
    return room;
  }

  joinRoom(socket, roomCode, nickname) {
    const code = sanitizeRoomCode(roomCode);
    const room = this.rooms.get(code);
    if (!room) {
      socket.emit("room_error", { message: "Room not found." });
      return null;
    }
    if (room.isFull()) {
      socket.emit("room_error", { message: "Room is full." });
      return null;
    }
    if (room.gameState !== "waiting") {
      socket.emit("room_error", { message: "Game already started." });
      return null;
    }

    const player = room.addPlayer(socket.id, sanitizeNickname(nickname));
    socket.join(code);
    socket.data.roomCode = code;
    socket.emit("room_joined", { roomCode: code, playerId: player.id });
    room.broadcastWaiting();
    if (room.players.size === 2) {
      room.startCountdown();
    }
    return room;
  }

  handleInput(socket, input) {
    const room = this.getSocketRoom(socket);
    if (!room) return;
    room.setInput(socket.id, {
      left: Boolean(input && input.left),
      right: Boolean(input && input.right),
      shoot: Boolean(input && input.shoot),
      shootPressed: Boolean(input && input.shootPressed),
      x: input && input.x,
      y: input && input.y,
      seq: input && input.seq,
    });
  }

  leaveRoom(socket, silent = false) {
    const room = this.getSocketRoom(socket);
    if (!room) return;
    const code = room.code;
    room.removePlayer(socket.id);
    socket.leave(code);
    socket.data.roomCode = null;

    if (room.players.size === 0) {
      this.deleteRoom(code);
      return;
    }

    room.gameState = "gameOver";
    room.io.to(code).emit("player_disconnected", {
      message: silent ? "Other player disconnected." : "Other player left the room.",
    });
  }

  restartRoom(socket) {
    const room = this.getSocketRoom(socket);
    if (!room) {
      socket.emit("room_error", { message: "You are not in a room." });
      return;
    }
    room.restart();
  }

  getSocketRoom(socket) {
    const code = socket.data.roomCode;
    if (!code) return null;
    return this.rooms.get(code) || null;
  }

  createUniqueCode() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      let code = "";
      for (let i = 0; i < 5; i += 1) {
        code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
    throw new Error("Unable to allocate room code.");
  }

  deleteRoom(code) {
    const room = this.rooms.get(code);
    if (!room) return;
    room.stop();
    this.rooms.delete(code);
  }

  cleanupInactiveRooms() {
    const now = Date.now();
    for (const [code, room] of this.rooms.entries()) {
      if (room.players.size === 0 || now - room.lastActiveAt > ROOM_IDLE_MS) {
        room.io.to(code).emit("room_error", { message: "Room closed due to inactivity." });
        this.deleteRoom(code);
      }
    }
  }

  stop() {
    clearInterval(this.cleanupTimer);
    for (const code of this.rooms.keys()) {
      this.deleteRoom(code);
    }
  }
}

module.exports = {
  RoomManager,
  sanitizeNickname,
  sanitizeRoomCode,
};
