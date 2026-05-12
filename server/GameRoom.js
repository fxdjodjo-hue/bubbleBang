"use strict";

const { TICK_RATE, SNAPSHOT_RATE, TEAM_LIVES } = require("./config");
const { LEVELS } = require("./levels");
const { circleRectOverlap, lineCircleOverlap } = require("./collision");
const ServerPlayer = require("./entities/ServerPlayer");
const ServerBall = require("./entities/ServerBall");
const ServerProjectile = require("./entities/ServerProjectile");

class GameRoom {
  constructor(io, code, onEmpty) {
    this.io = io;
    this.code = code;
    this.onEmpty = onEmpty;
    this.players = new Map();
    this.levelIndex = 0;
    this.score = 0;
    this.teamLives = TEAM_LIVES;
    this.gameState = "waiting";
    this.countdown = null;
    this.demoComplete = false;
    this.levelCompleteTimer = 0;
    this.platforms = [];
    this.balls = [];
    this.projectiles = [];
    this.events = [];
    this.nextEntityId = 1;
    this.lastActiveAt = Date.now();

    this.tickTimer = setInterval(() => this.tick(1 / TICK_RATE), 1000 / TICK_RATE);
    this.snapshotTimer = setInterval(() => this.broadcastSnapshot(), 1000 / SNAPSHOT_RATE);
  }

  addPlayer(socketId, nickname) {
    if (this.players.size >= 2) return null;
    const usedSlots = new Set([...this.players.values()].map((player) => player.slot));
    const slot = usedSlots.has(0) ? 1 : 0;
    const player = new ServerPlayer(socketId, nickname, slot);
    this.players.set(socketId, player);
    this.touch();
    return player;
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (!player) return false;
    this.players.delete(socketId);
    this.touch();
    return true;
  }

  setInput(socketId, input) {
    const player = this.players.get(socketId);
    if (!player) return;
    player.setInput(input);
    this.touch();
  }

  isFull() {
    return this.players.size >= 2;
  }

  canJoin() {
    return this.gameState === "waiting" && !this.isFull();
  }

  touch() {
    this.lastActiveAt = Date.now();
  }

  startCountdown() {
    this.levelIndex = 0;
    this.score = 0;
    this.teamLives = TEAM_LIVES;
    this.demoComplete = false;
    this.loadLevel();
    this.countdown = 3.2;
    this.gameState = "countdown";
    this.io.to(this.code).emit("countdown", { value: 3 });
    this.broadcastWaiting();
  }

  restart() {
    if (this.players.size < 2) {
      this.gameState = "waiting";
      this.countdown = null;
      this.broadcastWaiting();
      return;
    }
    this.startCountdown();
  }

  loadLevel() {
    const level = LEVELS[this.levelIndex];
    this.platforms = level.platforms.map((platform) => ({ ...platform }));
    this.balls = level.balls.map((ball) => new ServerBall(this.createId("ball"), ball));
    this.projectiles = [];
    this.levelCompleteTimer = 0;
    for (const player of this.players.values()) {
      player.resetPosition();
      player.invulnerable = 1.2;
      player.hitCooldown = 0;
      player.shootCooldown = 0;
      player.input = { left: false, right: false, shoot: false };
    }
  }

  createId(prefix) {
    const id = `${prefix}-${this.nextEntityId}`;
    this.nextEntityId += 1;
    return id;
  }

  tick(dt) {
    if (this.players.size === 0) return;

    if (this.gameState === "countdown") {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.countdown = null;
        this.gameState = "playing";
      }
      return;
    }

    if (this.gameState === "levelComplete" && !this.demoComplete) {
      this.levelCompleteTimer -= dt;
      if (this.levelCompleteTimer <= 0) {
        this.levelIndex += 1;
        this.loadLevel();
        this.countdown = 2.2;
        this.gameState = "countdown";
      }
      return;
    }

    if (this.gameState !== "playing") return;

    for (const player of this.players.values()) {
      player.update(dt, this.platforms);
      if (player.canShoot() && !this.projectiles.some((projectile) => projectile.ownerId === player.id)) {
        this.projectiles.push(new ServerProjectile(this.createId("projectile"), player.id, player.shootX, player.shootY));
        player.markShot();
        this.events.push({ type: "shoot", playerId: player.id, x: player.shootX, y: player.shootY });
      }
    }

    for (const projectile of this.projectiles) {
      projectile.update(dt, this.platforms);
    }
    this.projectiles = this.projectiles.filter((projectile) => projectile.active);

    for (const ball of this.balls) {
      ball.update(dt, this.platforms);
    }

    this.handleProjectileCollisions();
    this.handlePlayerCollisions();
    this.checkLevelClear();
  }

  handleProjectileCollisions() {
    for (let projectileIndex = this.projectiles.length - 1; projectileIndex >= 0; projectileIndex -= 1) {
      const projectile = this.projectiles[projectileIndex];
      for (let ballIndex = this.balls.length - 1; ballIndex >= 0; ballIndex -= 1) {
        const ball = this.balls[ballIndex];
        if (!lineCircleOverlap(projectile.rect, ball)) continue;

        this.score += ball.type.score;
        const splitBalls = ball.split(() => this.createId("ball"), this.playerRects());
        this.events.push({
          type: "ball_hit",
          x: ball.x,
          y: ball.y,
          size: ball.size,
          color: ball.type.color,
          score: ball.type.score,
          ownerId: projectile.ownerId,
        });
        this.balls.splice(ballIndex, 1, ...splitBalls);
        this.projectiles.splice(projectileIndex, 1);
        return;
      }
    }
  }

  handlePlayerCollisions() {
    for (const ball of this.balls) {
      for (const player of this.players.values()) {
        if (!circleRectOverlap(ball, player.rect)) continue;
        if (!player.takeHit()) continue;
        this.teamLives -= 1;
        this.events.push({ type: "player_hit", playerId: player.id, x: player.shootX, y: player.y + 25 });
        if (this.teamLives <= 0) {
          this.teamLives = 0;
          this.gameState = "gameOver";
          this.io.to(this.code).emit("game_over", { score: this.score });
        }
        return;
      }
    }
  }

  checkLevelClear() {
    if (this.balls.length > 0) return;

    this.score += 1500 + (this.levelIndex + 1) * 250;
    this.projectiles = [];
    this.gameState = "levelComplete";
    this.demoComplete = this.levelIndex >= LEVELS.length - 1;
    this.levelCompleteTimer = 2.2;
    this.io.to(this.code).emit("level_complete", {
      level: this.levelIndex + 1,
      score: this.score,
      demoComplete: this.demoComplete,
    });
  }

  playerRects() {
    return [...this.players.values()].map((player) => player.rect);
  }

  broadcastWaiting() {
    this.io.to(this.code).emit("waiting_for_player", {
      roomCode: this.code,
      players: [...this.players.values()].map((player) => player.snapshot()),
    });
  }

  broadcastSnapshot() {
    if (this.players.size === 0) return;
    const events = this.events;
    this.events = [];
    this.io.to(this.code).emit("snapshot", this.snapshot(events));
  }

  snapshot(events = []) {
    return {
      type: "snapshot",
      serverTime: Date.now(),
      roomCode: this.code,
      gameState: this.gameState,
      countdown: this.countdown === null ? null : Math.max(0, Math.ceil(this.countdown)),
      level: this.levelIndex + 1,
      score: this.score,
      teamLives: this.teamLives,
      demoComplete: this.demoComplete,
      players: [...this.players.values()].map((player) => player.snapshot()),
      projectiles: this.projectiles.map((projectile) => projectile.snapshot()),
      balls: this.balls.map((ball) => ball.snapshot()),
      platforms: this.platforms.map((platform) => ({ ...platform })),
      events,
    };
  }

  stop() {
    clearInterval(this.tickTimer);
    clearInterval(this.snapshotTimer);
  }
}

module.exports = GameRoom;
