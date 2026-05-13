"use strict";

const {
  TICK_RATE,
  SNAPSHOT_RATE,
  TEAM_LIVES,
  TEAM_MAX_LIVES,
  LEVEL_TIME_SECONDS,
  LEVEL_CLEAR_TIME_BONUS,
  POWERUP_DOUBLE_SHOT,
  POWERUP_HEART,
  POWERUP_DURATION,
  POWERUP_DROP_CHANCE,
  HEART_DROP_CHANCE,
} = require("./config");
const { EVENTS, PROTOCOL_VERSION } = require("../shared/protocol");
const { LEVELS } = require("./levels");
const { circleRectOverlap, lineCircleOverlap, rectOverlap } = require("./collision");
const ServerPlayer = require("./entities/ServerPlayer");
const ServerBall = require("./entities/ServerBall");
const ServerProjectile = require("./entities/ServerProjectile");
const ServerPowerUp = require("./entities/ServerPowerUp");

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
    this.powerUps = [];
    this.levelTimeLeft = LEVEL_TIME_SECONDS;
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
    for (const player of this.players.values()) {
      player.resetPowerUps();
    }
    this.loadLevel();
    this.countdown = 3.2;
    this.gameState = "countdown";
    this.io.to(this.code).emit(EVENTS.COUNTDOWN, { value: 3 });
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
    this.powerUps = [];
    this.levelTimeLeft = LEVEL_TIME_SECONDS;
    this.levelCompleteTimer = 0;
    for (const player of this.players.values()) {
      player.resetPosition();
      player.invulnerable = 1.2;
      player.hitCooldown = 0;
      player.shootCooldown = 0;
      player.vy = 0;
      player.onGround = true;
      player.input = { left: false, right: false, shoot: false, shootPressed: false };
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

    this.levelTimeLeft = Math.max(0, this.levelTimeLeft - dt);
    if (this.levelTimeLeft <= 0) {
      this.handleLevelTimeout();
      return;
    }

    for (const player of this.players.values()) {
      player.update(dt, this.platforms);
      if (player.wantsToShoot()) {
        const ownedProjectiles = this.projectiles.filter((projectile) => projectile.ownerId === player.id);
        if (player.canShoot() && ownedProjectiles.length < player.maxProjectiles) {
          const laneOffset = player.maxProjectiles > 1 ? (ownedProjectiles.length % 2 === 0 ? -8 : 8) : 0;
          this.projectiles.push(
            new ServerProjectile(this.createId("projectile"), player.id, player.shootX + laneOffset, player.shootY)
          );
          player.markShot();
          this.events.push({ type: "shoot", playerId: player.id, x: player.shootX, y: player.shootY });
        }
        player.consumeShootRequest();
      }
    }

    for (const projectile of this.projectiles) {
      projectile.update(dt, this.platforms);
    }
    this.projectiles = this.projectiles.filter((projectile) => projectile.active);

    for (const ball of this.balls) {
      ball.update(dt, this.platforms);
    }

    for (const powerUp of this.powerUps) {
      powerUp.update(dt);
    }
    this.handlePowerUpCollections();
    this.powerUps = this.powerUps.filter((powerUp) => powerUp.active);

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
        this.maybeDropPowerUp(ball);
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

  maybeDropPowerUp(ball) {
    if (ball.size === "tiny" || this.powerUps.length >= 2) return;
    const hasActiveDoubleShot = [...this.players.values()].some(
      (player) => player.powerUps[POWERUP_DOUBLE_SHOT] > 0
    );
    const candidates = [];
    if (this.teamLives < TEAM_MAX_LIVES) {
      candidates.push({ type: POWERUP_HEART, chance: HEART_DROP_CHANCE });
    }
    if (!hasActiveDoubleShot) {
      candidates.push({ type: POWERUP_DOUBLE_SHOT, chance: POWERUP_DROP_CHANCE });
    }
    const totalChance = candidates.reduce((sum, candidate) => sum + candidate.chance, 0);
    let roll = Math.random();
    if (roll > totalChance) return;
    let type = null;
    for (const candidate of candidates) {
      if (roll <= candidate.chance) {
        type = candidate.type;
        break;
      }
      roll -= candidate.chance;
    }
    if (!type) return;
    this.powerUps.push(
      new ServerPowerUp(this.createId("power"), {
        type,
        x: ball.x,
        y: ball.y,
      })
    );
  }

  handlePowerUpCollections() {
    for (let powerUpIndex = this.powerUps.length - 1; powerUpIndex >= 0; powerUpIndex -= 1) {
      const powerUp = this.powerUps[powerUpIndex];
      for (const player of this.players.values()) {
        if (!rectOverlap(powerUp.rect, player.rect)) continue;
        if (powerUp.type === POWERUP_HEART) {
          this.teamLives = Math.min(TEAM_MAX_LIVES, this.teamLives + 1);
          this.score += 300;
        } else {
          player.activatePowerUp(powerUp.type, POWERUP_DURATION);
          this.score += 250;
        }
        this.events.push({
          type: "power_up",
          playerId: player.id,
          powerUp: powerUp.type,
          x: powerUp.x + powerUp.width * 0.5,
          y: powerUp.y + powerUp.height * 0.5,
        });
        this.powerUps.splice(powerUpIndex, 1);
        break;
      }
    }
  }

  handlePlayerCollisions() {
    for (const ball of this.balls) {
      for (const player of this.players.values()) {
        if (!circleRectOverlap(ball, player.rect)) continue;
        if (!player.takeHit()) continue;
        this.teamLives -= 1;
        this.projectiles = this.projectiles.filter((projectile) => projectile.ownerId !== player.id);
        this.powerUps = [];
        this.events.push({ type: "player_hit", playerId: player.id, x: player.shootX, y: player.y + 25 });
        if (this.teamLives <= 0) {
          this.teamLives = 0;
          this.gameState = "gameOver";
          this.io.to(this.code).emit(EVENTS.GAME_OVER, { score: this.score });
        }
        return;
      }
    }
  }

  handleLevelTimeout() {
    this.teamLives -= 1;
    this.events.push({ type: "timer_expired", x: 480, y: 220 });
    for (const player of this.players.values()) {
      player.resetPowerUps();
    }
    if (this.teamLives <= 0) {
      this.teamLives = 0;
      this.gameState = "gameOver";
      this.io.to(this.code).emit(EVENTS.GAME_OVER, { score: this.score });
      return;
    }
    this.loadLevel();
    this.countdown = 2.2;
    this.gameState = "countdown";
  }

  checkLevelClear() {
    if (this.balls.length > 0) return;

    this.score +=
      1500 +
      (this.levelIndex + 1) * 250 +
      Math.ceil(this.levelTimeLeft) * LEVEL_CLEAR_TIME_BONUS;
    this.projectiles = [];
    this.powerUps = [];
    this.gameState = "levelComplete";
    this.demoComplete = this.levelIndex >= LEVELS.length - 1;
    this.levelCompleteTimer = 2.2;
    this.io.to(this.code).emit(EVENTS.LEVEL_COMPLETE, {
      level: this.levelIndex + 1,
      score: this.score,
      demoComplete: this.demoComplete,
    });
  }

  playerRects() {
    return [...this.players.values()].map((player) => player.rect);
  }

  broadcastWaiting() {
    this.io.to(this.code).emit(EVENTS.WAITING_FOR_PLAYER, {
      roomCode: this.code,
      players: [...this.players.values()].map((player) => player.snapshot()),
    });
  }

  broadcastSnapshot() {
    if (this.players.size === 0) return;
    const events = this.events;
    this.events = [];
    this.io.to(this.code).emit(EVENTS.SNAPSHOT, this.snapshot(events));
  }

  snapshot(events = []) {
    return {
      type: "snapshot",
      protocolVersion: PROTOCOL_VERSION,
      serverTime: Date.now(),
      roomCode: this.code,
      gameState: this.gameState,
      countdown: this.countdown === null ? null : Math.max(0, Math.ceil(this.countdown)),
      level: this.levelIndex + 1,
      score: this.score,
      teamLives: this.teamLives,
      teamMaxLives: TEAM_MAX_LIVES,
      timeLeft: this.levelTimeLeft,
      demoComplete: this.demoComplete,
      players: [...this.players.values()].map((player) => player.snapshot()),
      projectiles: this.projectiles.map((projectile) => projectile.snapshot()),
      powerUps: this.powerUps.map((powerUp) => powerUp.snapshot()),
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
