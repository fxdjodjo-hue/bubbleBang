"use strict";

const { WIDTH, FLOOR_Y } = require("../config");
const { BALL_TYPES } = require("../levels");
const { clamp, circleRectOverlap } = require("../collision");

class ServerBall {
  constructor(id, { size, x, y, vx, vy }) {
    this.id = id;
    this.size = size;
    this.radius = BALL_TYPES[size].radius;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.gravity = 900;
  }

  get type() {
    return BALL_TYPES[this.size];
  }

  update(dt, platforms) {
    this.vy += this.gravity * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (this.x - this.radius < 14) {
      this.x = 14 + this.radius;
      this.vx = Math.abs(this.vx);
    } else if (this.x + this.radius > WIDTH - 14) {
      this.x = WIDTH - 14 - this.radius;
      this.vx = -Math.abs(this.vx);
    }

    if (this.y - this.radius < 16) {
      this.y = 16 + this.radius;
      this.vy = Math.abs(this.vy) * 0.65;
    }

    if (this.y + this.radius > FLOOR_Y) {
      this.y = FLOOR_Y - this.radius;
      this.vy = -this.type.bounce;
    }

    for (const platform of platforms) {
      this.resolvePlatform(platform);
    }
  }

  resolvePlatform(platform) {
    if (!circleRectOverlap(this, platform)) return;
    const nearestX = clamp(this.x, platform.x, platform.x + platform.width);
    const nearestY = clamp(this.y, platform.y, platform.y + platform.height);
    const dx = this.x - nearestX;
    const dy = this.y - nearestY;
    const overlapX = this.radius - Math.abs(dx);

    if (Math.abs(dx) > Math.abs(dy) && overlapX > 0) {
      this.x += dx >= 0 ? overlapX : -overlapX;
      this.vx *= -1;
    } else if (this.y < platform.y) {
      this.y = platform.y - this.radius;
      this.vy = -Math.abs(this.type.bounce * 0.86);
    } else {
      this.y = platform.y + platform.height + this.radius;
      this.vy = Math.abs(this.vy) * 0.7;
    }
  }

  split(createId, playerRects) {
    const nextSize = this.type.next;
    if (!nextSize) return [];

    const nextType = BALL_TYPES[nextSize];
    const speed = Math.max(185, Math.abs(this.vx) + 35);
    const spawnY = Math.min(this.y, FLOOR_Y - nextType.radius - 8);
    const leftX = this.safeSplitX(this.x - nextType.radius * 0.55, nextType.radius, playerRects);
    const rightX = this.safeSplitX(this.x + nextType.radius * 0.55, nextType.radius, playerRects);

    return [
      new ServerBall(createId(), {
        size: nextSize,
        x: leftX,
        y: spawnY,
        vx: -speed,
        vy: -nextType.bounce * 0.88,
      }),
      new ServerBall(createId(), {
        size: nextSize,
        x: rightX,
        y: spawnY,
        vx: speed,
        vy: -nextType.bounce * 0.88,
      }),
    ];
  }

  safeSplitX(x, radius, playerRects) {
    let safeX = clamp(x, 20 + radius, WIDTH - 20 - radius);
    for (const playerRect of playerRects) {
      const paddedPlayer = {
        x: playerRect.x - radius - 18,
        y: playerRect.y - radius - 18,
        width: playerRect.width + radius * 2 + 36,
        height: playerRect.height + radius * 2 + 36,
      };
      const overlapsX = safeX > paddedPlayer.x && safeX < paddedPlayer.x + paddedPlayer.width;
      const overlapsY = this.y > paddedPlayer.y && this.y < paddedPlayer.y + paddedPlayer.height;
      if (overlapsX && overlapsY) {
        const leftDistance = Math.abs(safeX - paddedPlayer.x);
        const rightDistance = Math.abs(safeX - (paddedPlayer.x + paddedPlayer.width));
        safeX = leftDistance < rightDistance ? paddedPlayer.x : paddedPlayer.x + paddedPlayer.width;
        safeX = clamp(safeX, 20 + radius, WIDTH - 20 - radius);
      }
    }
    return safeX;
  }

  snapshot() {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      radius: this.radius,
      vx: this.vx,
      vy: this.vy,
      size: this.size,
    };
  }
}

module.exports = ServerBall;
