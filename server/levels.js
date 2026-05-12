"use strict";

const BALL_TYPES = {
  large: {
    radius: 42,
    next: "medium",
    score: 100,
    color: "#ff5bc8",
    bounce: 510,
  },
  medium: {
    radius: 30,
    next: "small",
    score: 200,
    color: "#ffd166",
    bounce: 455,
  },
  small: {
    radius: 21,
    next: "tiny",
    score: 400,
    color: "#77f3ff",
    bounce: 390,
  },
  tiny: {
    radius: 14,
    next: null,
    score: 800,
    color: "#8cff82",
    bounce: 330,
  },
};

const LEVELS = [
  {
    balls: [{ size: "large", x: 470, y: 110, vx: 150, vy: 0 }],
    platforms: [],
  },
  {
    balls: [
      { size: "medium", x: 300, y: 130, vx: 170, vy: 0 },
      { size: "medium", x: 660, y: 130, vx: -170, vy: 0 },
    ],
    platforms: [{ x: 405, y: 325, width: 150, height: 18 }],
  },
  {
    balls: [
      { size: "large", x: 255, y: 105, vx: 145, vy: 0 },
      { size: "small", x: 700, y: 150, vx: -210, vy: -40 },
    ],
    platforms: [{ x: 340, y: 298, width: 280, height: 18 }],
  },
  {
    balls: [
      { size: "large", x: 260, y: 120, vx: 180, vy: 0 },
      { size: "large", x: 700, y: 120, vx: -185, vy: 0 },
    ],
    platforms: [
      { x: 180, y: 330, width: 145, height: 18 },
      { x: 635, y: 330, width: 145, height: 18 },
    ],
  },
  {
    balls: [
      { size: "large", x: 175, y: 105, vx: 220, vy: -20 },
      { size: "medium", x: 520, y: 130, vx: -245, vy: 0 },
      { size: "small", x: 790, y: 180, vx: -255, vy: -80 },
    ],
    platforms: [
      { x: 255, y: 285, width: 165, height: 18 },
      { x: 540, y: 355, width: 185, height: 18 },
    ],
  },
];

module.exports = {
  BALL_TYPES,
  LEVELS,
};
