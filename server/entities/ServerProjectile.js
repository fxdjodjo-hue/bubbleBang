"use strict";

const { PROJECTILE_SPEED } = require("../config");
const { rectOverlap } = require("../collision");

class ServerProjectile {
  constructor(id, ownerId, x, y) {
    this.id = id;
    this.ownerId = ownerId;
    this.x = x;
    this.y = y;
    this.originY = y;
    this.width = 10;
    this.height = 0;
    this.speed = PROJECTILE_SPEED;
    this.active = true;
  }

  get rect() {
    return {
      x: this.x - this.width * 0.5,
      y: this.y,
      width: this.width,
      height: this.height,
    };
  }

  update(dt, platforms) {
    const previousY = this.y;
    this.y -= this.speed * dt;
    this.height = this.originY - this.y;
    if (this.y <= 20) {
      this.active = false;
      return;
    }

    for (const platform of platforms) {
      const sweptLine = {
        x: this.x - this.width * 0.5,
        y: this.y,
        width: this.width,
        height: previousY - this.y + this.height,
      };
      if (rectOverlap(sweptLine, platform)) {
        this.active = false;
        return;
      }
    }
  }

  snapshot() {
    return {
      id: this.id,
      ownerId: this.ownerId,
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
    };
  }
}

module.exports = ServerProjectile;
