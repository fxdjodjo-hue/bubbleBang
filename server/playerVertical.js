"use strict";

const { FLOOR_Y, PLAYER_GRAVITY, PLAYER_JUMP_VY, PLAYER_CEILING_Y } = require("./config");
const { rectOverlap } = require("./collision");

function playerBody(player) {
  return {
    x: player.x,
    y: player.y,
    width: player.width,
    height: player.height,
  };
}

function playerFeetOnSurface(player, platforms) {
  const feet = player.y + player.height;
  const cx = player.x;
  const cw = player.width;
  const tol = 5;
  if (player.vy < -38) return false;
  if (feet >= FLOOR_Y - tol && feet <= FLOOR_Y + 10) return true;
  for (let i = 0; i < platforms.length; i += 1) {
    const p = platforms[i];
    if (cx + cw <= p.x + 1 || cx >= p.x + p.width - 1) continue;
    if (feet >= p.y - tol && feet <= p.y + 12) return true;
  }
  return false;
}

/**
 * Mutates player.y, player.vy, player.onGround. Expects player.vy finite (default 0).
 * input.jumpPressed: edge pulse like shoot.
 */
function applyPlayerVertical(player, dt, input, platforms) {
  const oldY = player.y;
  if (input.jumpPressed && playerFeetOnSurface(player, platforms)) {
    player.vy = PLAYER_JUMP_VY;
  }
  player.vy += PLAYER_GRAVITY * dt;
  player.y += player.vy * dt;

  if (player.y + player.height > FLOOR_Y) {
    player.y = FLOOR_Y - player.height;
    if (player.vy > 0) player.vy = 0;
  }
  if (player.y < PLAYER_CEILING_Y) {
    player.y = PLAYER_CEILING_Y;
    if (player.vy < 0) player.vy = 0;
  }

  for (let i = 0; i < platforms.length; i += 1) {
    const p = platforms[i];
    const body = playerBody(player);
    if (!rectOverlap(body, p)) continue;
    const prevFeet = oldY + player.height;
    if (player.vy >= 0 && prevFeet <= p.y + 14 && player.y + player.height > p.y) {
      player.y = p.y - player.height;
      if (player.vy > 0) player.vy = 0;
      continue;
    }
    if (player.vy < 0 && oldY >= p.y + p.height - 14 && player.y < p.y + p.height) {
      player.y = p.y + p.height;
      if (player.vy < 0) player.vy = 0;
    }
  }

  player.onGround = playerFeetOnSurface(player, platforms) && player.vy >= -48;
}

module.exports = {
  applyPlayerVertical,
  playerFeetOnSurface,
};
