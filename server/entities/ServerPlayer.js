"use strict";

const {
  WIDTH,
  FLOOR_Y,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_SPEED,
  CLIENT_POSITION_TOLERANCE,
  CLIENT_POSITION_STALE_MS,
  SHOOT_COOLDOWN,
} = require("../config");
const { clamp, rectOverlap } = require("../collision");

class ServerPlayer {
  constructor(id, nickname, slot) {
    this.id = id;
    this.nickname = nickname;
    this.slot = slot;
    this.width = PLAYER_WIDTH;
    this.height = PLAYER_HEIGHT;
    this.speed = PLAYER_SPEED;
    this.input = { left: false, right: false, shoot: false };
    this.connected = true;
    this.facing = slot === 0 ? "right" : "left";
    this.invulnerable = 1.2;
    this.hitCooldown = 0;
    this.shootCooldown = 0;
    this.lastClientPositionAt = 0;
    this.clientPositionActiveUntil = 0;
    this.lastInputSeq = 0;
    this.resetPosition();
  }

  resetPosition() {
    const spawnX = this.slot === 0 ? WIDTH * 0.42 : WIDTH * 0.58;
    this.x = spawnX - this.width * 0.5;
    this.y = FLOOR_Y - this.height;
    this.lastClientPositionAt = Date.now();
    this.clientPositionActiveUntil = 0;
  }

  get rect() {
    return {
      x: this.x + 5,
      y: this.y + 6,
      width: this.width - 10,
      height: this.height - 6,
    };
  }

  get shootX() {
    return this.x + this.width * 0.5;
  }

  get shootY() {
    return this.y + 14;
  }

  setInput(input) {
    const shootPressed = Boolean(input && input.shootPressed);
    this.input = {
      left: Boolean(input && input.left),
      right: Boolean(input && input.right),
      shoot: Boolean(input && input.shoot),
      shootPressed: this.input.shootPressed || shootPressed,
    };

    if (Number.isFinite(input?.seq)) {
      this.lastInputSeq = Math.max(this.lastInputSeq, Number(input.seq));
    }

    const clientX = Number(input && input.x);
    if (Number.isFinite(clientX)) {
      this.applyClientPosition(clientX);
    }
  }

  update(dt, platforms) {
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);

    const direction = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
    if (direction < 0) this.facing = "left";
    if (direction > 0) this.facing = "right";

    if (Date.now() <= this.clientPositionActiveUntil) return;

    const oldX = this.x;
    this.x += direction * this.speed * dt;
    this.x = clamp(this.x, 14, WIDTH - this.width - 14);

    const playerRect = this.rect;
    for (const platform of platforms) {
      if (!rectOverlap(playerRect, platform)) continue;
      if (this.x > oldX) this.x = platform.x - this.width + 5;
      if (this.x < oldX) this.x = platform.x + platform.width - 5;
    }
  }

  applyClientPosition(clientX) {
    const now = Date.now();
    const minX = 14;
    const maxX = WIDTH - this.width - 14;
    const targetX = clamp(clientX, minX, maxX);

    const elapsed = clamp((now - this.lastClientPositionAt) / 1000, 0, 0.25);
    const maxStep = this.speed * elapsed + CLIENT_POSITION_TOLERANCE;
    const delta = targetX - this.x;
    this.x =
      Math.abs(delta) > maxStep
        ? clamp(this.x + Math.sign(delta) * maxStep, minX, maxX)
        : targetX;

    this.y = FLOOR_Y - this.height;
    this.lastClientPositionAt = now;
    this.clientPositionActiveUntil = now + CLIENT_POSITION_STALE_MS;
  }

  wantsToShoot() {
    return Boolean(this.input.shootPressed);
  }

  canShoot() {
    return this.shootCooldown <= 0;
  }

  markShot() {
    this.shootCooldown = SHOOT_COOLDOWN;
  }

  consumeShootRequest() {
    this.input.shootPressed = false;
  }

  takeHit() {
    if (this.invulnerable > 0 || this.hitCooldown > 0) return false;
    this.invulnerable = 1.7;
    this.hitCooldown = 0.3;
    return true;
  }

  snapshot() {
    return {
      id: this.id,
      nickname: this.nickname,
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      facing: this.facing,
      isShooting: this.shootCooldown > SHOOT_COOLDOWN - 0.12,
      invulnerable: this.invulnerable > 0,
      connected: this.connected,
    };
  }
}

module.exports = ServerPlayer;
