"use strict";

const {
  WIDTH,
  FLOOR_Y,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_SPEED,
  SHOOT_COOLDOWN,
  POWERUP_DOUBLE_SHOT,
} = require("../config");
const { clamp, rectOverlap } = require("../collision");
const { applyPlayerVertical } = require("../playerVertical");

class ServerPlayer {
  constructor(id, nickname, slot) {
    this.id = id;
    this.nickname = nickname;
    this.slot = slot;
    this.width = PLAYER_WIDTH;
    this.height = PLAYER_HEIGHT;
    this.speed = PLAYER_SPEED;
    this.vy = 0;
    this.onGround = true;
    this.input = { left: false, right: false, shoot: false, shootPressed: false };
    this.connected = true;
    this.facing = slot === 0 ? "right" : "left";
    this.invulnerable = 1.2;
    this.hitCooldown = 0;
    this.shootCooldown = 0;
    this.powerUps = { [POWERUP_DOUBLE_SHOT]: 0 };
    this.lastInputSeq = 0;
    this.resetPosition();
  }

  resetPosition() {
    const spawnX = this.slot === 0 ? WIDTH * 0.42 : WIDTH * 0.58;
    this.x = spawnX - this.width * 0.5;
    this.y = FLOOR_Y - this.height;
    this.vy = 0;
    this.onGround = true;
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
  }

  update(dt, platforms) {
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);
    this.updatePowerUps(dt);

    const direction = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
    if (direction < 0) this.facing = "left";
    if (direction > 0) this.facing = "right";

    const oldX = this.x;
    this.x += direction * this.speed * dt;
    this.x = clamp(this.x, 14, WIDTH - this.width - 14);

    const playerRect = this.rect;
    for (const platform of platforms) {
      if (!rectOverlap(playerRect, platform)) continue;
      if (this.x > oldX) this.x = platform.x - this.width + 5;
      if (this.x < oldX) this.x = platform.x + platform.width - 5;
    }

    applyPlayerVertical(this, dt, this.input, platforms);
    const oldX2 = this.x;
    const playerRect2 = this.rect;
    for (const platform of platforms) {
      if (!rectOverlap(playerRect2, platform)) continue;
      if (this.x > oldX2) this.x = platform.x - this.width + 5;
      if (this.x < oldX2) this.x = platform.x + platform.width - 5;
    }
  }

  wantsToShoot() {
    return Boolean(this.input.shootPressed);
  }

  canShoot() {
    return this.shootCooldown <= 0;
  }

  get maxProjectiles() {
    return this.powerUps[POWERUP_DOUBLE_SHOT] > 0 ? 2 : 1;
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
    this.resetPowerUps();
    return true;
  }

  activatePowerUp(type, duration) {
    if (!Object.prototype.hasOwnProperty.call(this.powerUps, type)) return;
    this.powerUps[type] = duration;
  }

  resetPowerUps() {
    this.powerUps = { [POWERUP_DOUBLE_SHOT]: 0 };
  }

  updatePowerUps(dt) {
    for (const key of Object.keys(this.powerUps)) {
      this.powerUps[key] = Math.max(0, this.powerUps[key] - dt);
    }
  }

  snapshot() {
    return {
      id: this.id,
      nickname: this.nickname,
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      vy: this.vy,
      onGround: this.onGround,
      facing: this.facing,
      isShooting: this.shootCooldown > SHOOT_COOLDOWN - 0.12,
      powerUps: { ...this.powerUps },
      invulnerable: this.invulnerable > 0,
      invulnerableTime: this.invulnerable,
      connected: this.connected,
      lastProcessedInputSeq: this.lastInputSeq,
    };
  }
}

module.exports = ServerPlayer;
