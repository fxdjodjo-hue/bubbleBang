"use strict";

const { FLOOR_Y, POWERUP_DOUBLE_SHOT, POWERUP_FALL_SPEED } = require("../config");

class ServerPowerUp {
  constructor(id, { type = POWERUP_DOUBLE_SHOT, x, y }) {
    this.id = id;
    this.type = type;
    this.x = x - 15;
    this.y = y - 12;
    this.width = 30;
    this.height = 24;
    this.ttl = 8;
    this.active = true;
  }

  get rect() {
    return {
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
    };
  }

  update(dt) {
    this.ttl -= dt;
    if (this.y + this.height < FLOOR_Y) {
      this.y = Math.min(FLOOR_Y - this.height, this.y + POWERUP_FALL_SPEED * dt);
    }
    if (this.ttl <= 0) this.active = false;
  }

  snapshot() {
    return {
      id: this.id,
      type: this.type,
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
    };
  }
}

module.exports = ServerPowerUp;
