"use strict";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function circleRectOverlap(circle, rect) {
  const nearestX = clamp(circle.x, rect.x, rect.x + rect.width);
  const nearestY = clamp(circle.y, rect.y, rect.y + rect.height);
  const dx = circle.x - nearestX;
  const dy = circle.y - nearestY;
  return dx * dx + dy * dy <= circle.radius * circle.radius;
}

function lineCircleOverlap(line, circle) {
  const nearestX = clamp(circle.x, line.x, line.x + line.width);
  const nearestY = clamp(circle.y, line.y, line.y + line.height);
  const dx = circle.x - nearestX;
  const dy = circle.y - nearestY;
  return dx * dx + dy * dy <= circle.radius * circle.radius;
}

function rectOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

module.exports = {
  clamp,
  circleRectOverlap,
  lineCircleOverlap,
  rectOverlap,
};
