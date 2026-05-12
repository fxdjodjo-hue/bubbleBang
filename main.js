(function () {
  "use strict";

  const WIDTH = 960;
  const HEIGHT = 540;
  const FLOOR_Y = HEIGHT - 58;
  const DEFAULT_SOCKET_SERVER = "https://bubblebang.onrender.com";
  const MULTIPLAYER_INTERPOLATION_DELAY_MS = 70;
  const MULTIPLAYER_INPUT_SEND_INTERVAL_MS = 33;
  const SERVER_CORRECTION_SNAP_DISTANCE = 360;
  const MULTIPLAYER_PLAYER_SPEED = 360;
  const LOCAL_PROJECTILE_SPEED = 760;
  const LOCAL_SHOT_COOLDOWN = 0.3;
  const PLAYER_GRAVITY = 2180;
  const PLAYER_CEILING_Y = 8;
  const MP_PLAYER_Y_SNAP = 72;
  const LEVEL_TIME_SECONDS = 90;
  const LEVEL_CLEAR_TIME_BONUS = 10;
  const MAX_PLAYER_LIVES = 5;
  const POWERUP_DOUBLE_SHOT = "doubleShot";
  const POWERUP_HEART = "heart";
  const POWERUP_DURATION = 12;
  const POWERUP_DROP_CHANCE = 0.28;
  const HEART_DROP_CHANCE = 0.18;
  const POWERUP_FALL_SPEED = 120;
  const STATE = {
    MENU: "menu",
    MULTIPLAYER_MENU: "multiplayerMenu",
    PLAYING: "playing",
    PAUSED: "paused",
    LEVEL_COMPLETE: "levelComplete",
    GAME_OVER: "gameOver",
    DEMO_COMPLETE: "demoComplete",
    MP_WAITING: "multiplayerWaiting",
    MP_COUNTDOWN: "multiplayerCountdown",
    MP_PLAYING: "multiplayerPlaying",
    MP_LEVEL_COMPLETE: "multiplayerLevelComplete",
    MP_GAME_OVER: "multiplayerGameOver",
  };

  const BALL_TYPES = {
    large: {
      radius: 42,
      next: "medium",
      score: 100,
      color: "#ff5bc8",
      glow: "rgba(255, 91, 200, 0.55)",
      bounce: 560,
    },
    medium: {
      radius: 30,
      next: "small",
      score: 200,
      color: "#ffd166",
      glow: "rgba(255, 209, 102, 0.5)",
      bounce: 520,
    },
    small: {
      radius: 21,
      next: "tiny",
      score: 400,
      color: "#77f3ff",
      glow: "rgba(119, 243, 255, 0.52)",
      bounce: 470,
    },
    tiny: {
      radius: 14,
      next: null,
      score: 800,
      color: "#8cff82",
      glow: "rgba(140, 255, 130, 0.48)",
      bounce: 410,
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

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const rand = (min, max) => min + Math.random() * (max - min);
  const lerp = (from, to, amount) => from + (to - from) * amount;

  function isMultiplayerState(state) {
    return state.startsWith("multiplayer");
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

  function applyPlayerVertical(player, dt, _input, platforms) {
    const oldY = player.y;
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

  function isTypingTarget(target) {
    if (!target || !target.tagName) return false;
    return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
  }

  function sanitizeNickname(value) {
    return String(value || "Player")
      .replace(/[^\w .-]/g, "")
      .trim()
      .slice(0, 16) || "Player";
  }

  function sanitizeRoomCode(value) {
    return String(value || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6);
  }

  function interpolateById(previousItems, nextItems, amount, interpolateItem) {
    const previousById = new Map(previousItems.map((item) => [item.id, item]));
    return nextItems.map((nextItem) => {
      const previousItem = previousById.get(nextItem.id);
      return previousItem ? interpolateItem(previousItem, nextItem, amount) : { ...nextItem };
    });
  }

  function interpolateSnapshot(previous, next, amount) {
    return {
      ...next,
      serverTime: lerp(previous.serverTime, next.serverTime, amount),
      players: interpolateById(previous.players || [], next.players || [], amount, (from, to, t) => ({
        ...to,
        x: lerp(from.x, to.x, t),
        y: lerp(from.y, to.y, t),
        vy: to.vy ?? from.vy ?? 0,
        onGround: to.onGround,
        invulnerableTime: to.invulnerableTime ?? from.invulnerableTime ?? 0,
      })),
      balls: interpolateById(previous.balls || [], next.balls || [], amount, (from, to, t) => ({
        ...to,
        x: lerp(from.x, to.x, t),
        y: lerp(from.y, to.y, t),
        vx: lerp(from.vx || 0, to.vx || 0, t),
        vy: lerp(from.vy || 0, to.vy || 0, t),
      })),
      projectiles: interpolateById(
        previous.projectiles || [],
        next.projectiles || [],
        amount,
        (from, to, t) => ({
          ...to,
          x: lerp(from.x, to.x, t),
          y: lerp(from.y, to.y, t),
          height: lerp(from.height, to.height, t),
        })
      ),
      powerUps: interpolateById(previous.powerUps || [], next.powerUps || [], amount, (from, to, t) => ({
        ...to,
        x: lerp(from.x, to.x, t),
        y: lerp(from.y, to.y, t),
      })),
      timeLeft: lerp(previous.timeLeft ?? next.timeLeft ?? LEVEL_TIME_SECONDS, next.timeLeft ?? LEVEL_TIME_SECONDS, amount),
    };
  }

  function normalizeSocketUrl(value) {
    const trimmed = String(value || "").trim().replace(/\/$/, "");
    if (!trimmed) return "";
    if (!/^https?:\/\//i.test(trimmed)) return "";
    return trimmed;
  }

  class InputManager {
    constructor(game) {
      this.game = game;
      this.keys = new Set();
      this.touch = { left: false, right: false, move: 0, shoot: false };
      this.pausePressed = false;
      this.confirmPressed = false;
      this.shootPressed = false;
      window.addEventListener("keydown", (event) => this.handleKeyDown(event));
      window.addEventListener("keyup", (event) => this.handleKeyUp(event));
      this.bindTouchMoveZone("touch-move-zone", "touch-stick");
      this.bindTouchShootZone("touch-shoot-zone");
      const touchControls = document.getElementById("touch-controls");
      const blockNativeTouch = (event) => event.preventDefault();
      touchControls.addEventListener("contextmenu", blockNativeTouch);
      touchControls.addEventListener("selectstart", blockNativeTouch);
      touchControls.addEventListener("touchmove", blockNativeTouch, { passive: false });

      document.getElementById("pause-button").addEventListener("click", () => this.game.togglePause());
      document.getElementById("game-root").addEventListener("pointerdown", (event) => {
        if (event.target.closest("button, input, form")) return;
        if (this.game.state === STATE.LEVEL_COMPLETE) this.confirmPressed = true;
        if (this.game.state === STATE.GAME_OVER || this.game.state === STATE.DEMO_COMPLETE) this.confirmPressed = true;
      });
    }

    bindTouchButton(id, action) {
      const button = document.getElementById(id);
      const setActive = (isActive) => {
        this.touch[action] = isActive;
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
      };
      const blockNativeTouch = (event) => {
        event.preventDefault();
      };
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("contextmenu", blockNativeTouch);
      button.addEventListener("selectstart", blockNativeTouch);
      button.addEventListener("dragstart", blockNativeTouch);
      button.addEventListener("touchstart", blockNativeTouch, { passive: false });
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        if (button.setPointerCapture) button.setPointerCapture(event.pointerId);
        setActive(true);
        if (navigator.vibrate) navigator.vibrate(12);
        if (action === "shoot") this.shootPressed = true;
      });
      button.addEventListener("pointerup", (event) => {
        event.preventDefault();
        setActive(false);
      });
      button.addEventListener("pointercancel", () => setActive(false));
      button.addEventListener("lostpointercapture", () => setActive(false));
    }

    bindTouchMoveZone(id, stickId) {
      const zone = document.getElementById(id);
      const stick = document.getElementById(stickId);
      const maxDistance = 38;
      const deadZone = 0.14;
      let activePointerId = null;

      const reset = () => {
        activePointerId = null;
        this.touch.move = 0;
        this.touch.left = false;
        this.touch.right = false;
        zone.classList.remove("active");
        zone.setAttribute("aria-valuenow", "0");
        stick.style.setProperty("--stick-x", "0px");
        stick.style.setProperty("--stick-y", "0px");
      };

      const setFromPointer = (event) => {
        const rect = zone.getBoundingClientRect();
        const centerX = rect.left + rect.width * 0.5;
        const originY = clamp(event.clientY - rect.top, 82, Math.max(82, rect.height - 82));
        const analogX = clamp((event.clientX - centerX) / (rect.width * 0.5), -1, 1);
        const move = Math.abs(analogX) < deadZone ? 0 : analogX;
        const stickX = move * maxDistance;

        this.touch.move = move;
        this.touch.left = move < 0;
        this.touch.right = move > 0;
        zone.classList.add("active");
        zone.setAttribute("aria-valuenow", move.toFixed(2));
        stick.style.setProperty("--stick-origin-x", `${rect.width * 0.5}px`);
        stick.style.setProperty("--stick-origin-y", `${originY}px`);
        stick.style.setProperty("--stick-x", `${stickX}px`);
        stick.style.setProperty("--stick-y", "0px");
      };

      const blockNativeTouch = (event) => event.preventDefault();
      zone.setAttribute("aria-valuenow", "0");
      zone.addEventListener("contextmenu", blockNativeTouch);
      zone.addEventListener("selectstart", blockNativeTouch);
      zone.addEventListener("dragstart", blockNativeTouch);
      zone.addEventListener("touchstart", blockNativeTouch, { passive: false });
      zone.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        activePointerId = event.pointerId;
        if (zone.setPointerCapture) zone.setPointerCapture(event.pointerId);
        setFromPointer(event);
        if (navigator.vibrate) navigator.vibrate(10);
      });
      zone.addEventListener("pointermove", (event) => {
        if (activePointerId !== event.pointerId) return;
        event.preventDefault();
        setFromPointer(event);
      });
      zone.addEventListener("pointerup", (event) => {
        if (activePointerId !== event.pointerId) return;
        event.preventDefault();
        reset();
      });
      zone.addEventListener("pointercancel", reset);
      zone.addEventListener("lostpointercapture", reset);
      stick.addEventListener("contextmenu", blockNativeTouch);
      stick.addEventListener("selectstart", blockNativeTouch);
    }

    bindTouchShootZone(id) {
      const zone = document.getElementById(id);
      const activePointers = new Set();
      const blockNativeTouch = (event) => event.preventDefault();
      const setActive = (isActive) => {
        this.touch.shoot = isActive;
        zone.setAttribute("aria-pressed", isActive ? "true" : "false");
      };

      zone.addEventListener("contextmenu", blockNativeTouch);
      zone.addEventListener("selectstart", blockNativeTouch);
      zone.addEventListener("dragstart", blockNativeTouch);
      zone.addEventListener("touchstart", blockNativeTouch, { passive: false });
      zone.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        activePointers.add(event.pointerId);
        if (zone.setPointerCapture) zone.setPointerCapture(event.pointerId);
        setActive(true);
        this.shootPressed = true;
        if (navigator.vibrate) navigator.vibrate(8);
      });
      zone.addEventListener("pointermove", (event) => {
        if (!activePointers.has(event.pointerId)) return;
        event.preventDefault();
      });
      const release = (event) => {
        if (event?.preventDefault) event.preventDefault();
        if (event?.pointerId !== undefined) activePointers.delete(event.pointerId);
        if (activePointers.size === 0) setActive(false);
      };
      zone.addEventListener("pointerup", release);
      zone.addEventListener("pointercancel", release);
      zone.addEventListener("lostpointercapture", release);
    }

    handleKeyDown(event) {
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (["arrowleft", "arrowright", " ", "spacebar"].includes(key)) {
        event.preventDefault();
      }
      if (!this.keys.has(key)) {
        if (key === " " || key === "spacebar") this.shootPressed = true;
        if (key === "enter") this.confirmPressed = true;
        if (key === "escape" || key === "p") this.pausePressed = true;
      }
      this.keys.add(key);
    }

    handleKeyUp(event) {
      if (isTypingTarget(event.target)) return;
      this.keys.delete(event.key.toLowerCase());
    }

    consumeFrameActions() {
      const keyLeft = this.keys.has("arrowleft") || this.keys.has("a");
      const keyRight = this.keys.has("arrowright") || this.keys.has("d");
      const keyboardMove = (keyRight ? 1 : 0) - (keyLeft ? 1 : 0);
      const left = keyLeft || this.touch.left;
      const right = keyRight || this.touch.right;
      const shoot = this.keys.has(" ") || this.keys.has("spacebar") || this.touch.shoot;
      const actions = {
        left,
        right,
        move: keyboardMove !== 0 ? keyboardMove : this.touch.move,
        shoot,
        shootPressed: this.shootPressed,
        confirm: this.confirmPressed,
        pause: this.pausePressed,
      };
      this.shootPressed = false;
      this.confirmPressed = false;
      this.pausePressed = false;
      return actions;
    }
  }

  class Player {
    constructor() {
      this.width = 46;
      this.height = 58;
      this.speed = 360;
      this.vy = 0;
      this.onGround = true;
      this.facing = "right";
      this.isWalking = false;
      this.resetForRun();
    }

    resetForRun() {
      this.lives = 3;
      this.resetPosition();
      this.invulnerable = 0;
      this.hitCooldown = 0;
      this.facing = "right";
      this.isWalking = false;
      this.vy = 0;
      this.onGround = true;
    }

    resetPosition() {
      this.x = WIDTH * 0.5 - this.width * 0.5;
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

    update(dt, input, platforms) {
      this.invulnerable = Math.max(0, this.invulnerable - dt);
      this.hitCooldown = Math.max(0, this.hitCooldown - dt);
      const oldX = this.x;
      const direction = input.move;
      if (direction < 0) this.facing = "left";
      if (direction > 0) this.facing = "right";
      this.x += direction * this.speed * dt;
      this.x = clamp(this.x, 14, WIDTH - this.width - 14);

      const playerRect = this.rect;
      for (const platform of platforms) {
        if (!rectOverlap(playerRect, platform)) continue;
        if (this.x > oldX) this.x = platform.x - this.width + 5;
        if (this.x < oldX) this.x = platform.x + platform.width - 5;
      }

      applyPlayerVertical(this, dt, input, platforms);

      const oldX2 = this.x;
      const playerRect2 = this.rect;
      for (const platform of platforms) {
        if (!rectOverlap(playerRect2, platform)) continue;
        if (this.x > oldX2) this.x = platform.x - this.width + 5;
        if (this.x < oldX2) this.x = platform.x + platform.width - 5;
      }

      this.isWalking = direction !== 0 && this.onGround;
    }

    takeHit() {
      if (this.invulnerable > 0 || this.hitCooldown > 0) return false;
      this.lives -= 1;
      this.invulnerable = 1.7;
      this.hitCooldown = 0.3;
      return true;
    }

    render(ctx, options = {}) {
      renderPlayerShape(
        ctx,
        {
          id: "single-player",
          nickname: "",
          x: this.x,
          y: this.y,
          width: this.width,
          height: this.height,
          invulnerable: this.invulnerable,
        },
        {
          primary: "#77f3ff",
          accent: "#ff5bc8",
          showName: false,
          facing: this.facing,
          isWalking: this.isWalking,
          hasProjectile: Boolean(options.projectile),
          pose: options.pose || null,
          onGround: this.onGround !== false,
        }
      );
    }
  }

  class Projectile {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.originY = y;
      this.width = 7;
      this.height = 0;
      this.speed = 760;
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
          break;
        }
      }
    }

    render(ctx) {
      if (!this.active) return;
      renderProjectileLine(ctx, this.x, this.y, this.originY);
    }
  }

  class PowerUp {
    constructor({ type = POWERUP_DOUBLE_SHOT, x, y }) {
      this.id = `power-${performance.now()}-${Math.random().toString(16).slice(2)}`;
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

    render(ctx) {
      renderPowerUpVisual(ctx, this);
    }
  }

  class Ball {
    constructor({ size, x, y, vx, vy }) {
      const type = BALL_TYPES[size];
      this.size = size;
      this.radius = type.radius;
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.gravity = 900;
      this.hitFlash = 0;
      this.squash = 0;
    }

    get type() {
      return BALL_TYPES[this.size];
    }

    update(dt, platforms) {
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      this.squash = Math.max(0, this.squash - dt * 4);
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
        this.squash = 1;
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
      } else {
        if (this.y < platform.y) {
          this.y = platform.y - this.radius;
          this.vy = -Math.abs(this.type.bounce * 0.86);
          this.squash = 0.8;
        } else {
          this.y = platform.y + platform.height + this.radius;
          this.vy = Math.abs(this.vy) * 0.7;
        }
      }
    }

    split(playerRect) {
      const nextSize = this.type.next;
      if (!nextSize) return [];
      const nextType = BALL_TYPES[nextSize];
      const speed = Math.max(185, Math.abs(this.vx) + 35);
      const spawnY = Math.min(this.y, FLOOR_Y - nextType.radius - 8);
      const leftX = this.safeSplitX(this.x - nextType.radius * 0.55, nextType.radius, playerRect);
      const rightX = this.safeSplitX(this.x + nextType.radius * 0.55, nextType.radius, playerRect);
      return [
        new Ball({ size: nextSize, x: leftX, y: spawnY, vx: -speed, vy: -nextType.bounce * 0.88 }),
        new Ball({ size: nextSize, x: rightX, y: spawnY, vx: speed, vy: -nextType.bounce * 0.88 }),
      ];
    }

    safeSplitX(x, radius, playerRect) {
      const paddedPlayer = {
        x: playerRect.x - radius - 18,
        y: playerRect.y - radius - 18,
        width: playerRect.width + radius * 2 + 36,
        height: playerRect.height + radius * 2 + 36,
      };
      let safeX = clamp(x, 20 + radius, WIDTH - 20 - radius);
      if (
        safeX > paddedPlayer.x &&
        safeX < paddedPlayer.x + paddedPlayer.width &&
        this.y > paddedPlayer.y &&
        this.y < paddedPlayer.y + paddedPlayer.height
      ) {
        const leftDistance = Math.abs(safeX - paddedPlayer.x);
        const rightDistance = Math.abs(safeX - (paddedPlayer.x + paddedPlayer.width));
        safeX = leftDistance < rightDistance ? paddedPlayer.x : paddedPlayer.x + paddedPlayer.width;
        safeX = clamp(safeX, 20 + radius, WIDTH - 20 - radius);
      }
      return safeX;
    }

    render(ctx) {
      renderBallVisual(ctx, this, this.hitFlash, this.squash);
    }
  }

  class ParticleSystem {
    constructor() {
      this.particles = [];
    }

    burst(x, y, color, amount = 18) {
      for (let i = 0; i < amount; i += 1) {
        const angle = rand(0, Math.PI * 2);
        const speed = rand(90, 330);
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - rand(20, 120),
          life: rand(0.35, 0.72),
          maxLife: 0.72,
          size: rand(2, 5),
          color,
        });
      }
    }

    update(dt) {
      for (const particle of this.particles) {
        particle.life -= dt;
        particle.vy += 720 * dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
      }
      this.particles = this.particles.filter((particle) => particle.life > 0);
    }

    render(ctx) {
      ctx.save();
      for (const particle of this.particles) {
        const alpha = clamp(particle.life / particle.maxLife, 0, 1);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = particle.color;
        ctx.shadowColor = particle.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * alpha, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  class SoundEngine {
    constructor() {
      this.context = null;
      this.master = null;
      this.musicGain = null;
      this.musicTimer = null;
      this.musicStep = 0;
      this.musicNextTime = 0;
    }

    ensureContext() {
      if (this.context) return this.context;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.18;
      this.master.connect(this.context.destination);
      return this.context;
    }

    unlock() {
      const ctx = this.ensureContext();
      if (ctx && ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
    }

    startMusic() {
      const ctx = this.ensureContext();
      if (!ctx || this.musicTimer) return;
      this.unlock();
      this.musicGain = ctx.createGain();
      this.musicGain.gain.setValueAtTime(0.0001, ctx.currentTime);
      this.musicGain.gain.exponentialRampToValueAtTime(0.055, ctx.currentTime + 1.4);
      this.musicGain.connect(this.master);
      this.musicStep = 0;
      this.musicNextTime = ctx.currentTime + 0.08;
      this.scheduleMusic();
      this.musicTimer = setInterval(() => this.scheduleMusic(), 700);
    }

    stopMusic() {
      if (this.musicTimer) {
        clearInterval(this.musicTimer);
        this.musicTimer = null;
      }
      if (!this.context || !this.musicGain) return;
      const gain = this.musicGain;
      const now = this.context.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
      setTimeout(() => {
        try {
          gain.disconnect();
        } catch (_error) {
          // Already disconnected.
        }
      }, 1000);
      this.musicGain = null;
    }

    scheduleMusic() {
      if (!this.context || !this.musicGain) return;
      const lookAhead = this.context.currentTime + 3.2;
      const melody = [392, 440, 523.25, 659.25, 587.33, 523.25, 440, 329.63];
      const bass = [130.81, 146.83, 164.81, 196];
      while (this.musicNextTime < lookAhead) {
        const step = this.musicStep;
        const phrase = Math.floor(step / 8);
        if (step % 4 === 0) {
          const root = bass[(step / 4) % bass.length];
          this.musicPad([root, root * 1.5, root * 2], this.musicNextTime, 3.6);
        }
        if ((step + phrase) % 2 === 0) {
          const note = melody[(step + phrase * 2) % melody.length];
          this.musicBell(note, this.musicNextTime + 0.06, 1.7);
        }
        if (step % 8 === 6) {
          this.musicBell(melody[(step + 3) % melody.length] * 0.5, this.musicNextTime + 0.24, 2.1, 0.012);
        }
        this.musicStep += 1;
        this.musicNextTime += 0.72;
      }
    }

    musicPad(frequencies, start, duration) {
      for (const frequency of frequencies) {
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(0.012, start + 0.45);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        osc.connect(gain);
        gain.connect(this.musicGain);
        osc.start(start);
        osc.stop(start + duration + 0.05);
      }
    }

    musicBell(frequency, start, duration, volume = 0.018) {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain);
      gain.connect(this.musicGain);
      osc.start(start);
      osc.stop(start + duration + 0.05);
    }

    play(name) {
      const ctx = this.ensureContext();
      if (!ctx || !this.master) return;
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
      const now = ctx.currentTime;
      if (name === "shoot") {
        this.tone(760, now, 0.075, "square", 0.09, 360);
      } else if (name === "pop") {
        this.tone(260, now, 0.1, "triangle", 0.1, 720);
        this.tone(920, now + 0.025, 0.06, "sine", 0.05, 420);
      } else if (name === "hurt") {
        this.tone(180, now, 0.22, "sawtooth", 0.11, 70);
      } else if (name === "powerup") {
        this.tone(520, now, 0.08, "triangle", 0.08, 650);
        this.tone(780, now + 0.08, 0.1, "triangle", 0.08, 1040);
      } else if (name === "heart") {
        this.tone(440, now, 0.08, "sine", 0.07, 660);
        this.tone(660, now + 0.08, 0.12, "sine", 0.07, 880);
      } else if (name === "clear") {
        this.tone(520, now, 0.08, "triangle", 0.08);
        this.tone(660, now + 0.08, 0.08, "triangle", 0.08);
        this.tone(880, now + 0.16, 0.14, "triangle", 0.08);
      } else if (name === "timeout") {
        this.tone(140, now, 0.18, "square", 0.09, 90);
        this.tone(95, now + 0.18, 0.2, "square", 0.08, 60);
      }
    }

    tone(frequency, start, duration, type = "sine", volume = 0.08, endFrequency = null) {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, start);
      if (endFrequency !== null) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
      }
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    }
  }

  class LevelManager {
    constructor() {
      this.index = 0;
    }

    get currentNumber() {
      return this.index + 1;
    }

    get isFinalLevel() {
      return this.index >= LEVELS.length - 1;
    }

    get current() {
      return LEVELS[this.index];
    }

    reset() {
      this.index = 0;
    }

    next() {
      this.index += 1;
      return this.index < LEVELS.length;
    }
  }

  class SocketClient {
    constructor(game) {
      this.game = game;
      this.socket = null;
      this.playerId = null;
      this.roomCode = "";
      this.pendingConnectAction = null;
      this.lastInputPayload = "";
      this.lastInputControlsPayload = "";
      this.lastInputSentAt = 0;
      this.lastSentPlayerX = null;
      this.lastSentPlayerY = null;
      this.inputSequence = 0;
      this.serverUrl = this.loadServerUrl();
      this.transport = "--";
      this.latencyTimer = null;
    }

    get url() {
      if (this.serverUrl) return this.serverUrl;
      if (window.location.protocol === "file:") return "http://localhost:3001";
      const localHost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
      if (localHost && window.location.port && window.location.port !== "3001") {
        return "http://localhost:3001";
      }
      return DEFAULT_SOCKET_SERVER;
    }

    loadServerUrl() {
      const query = new URLSearchParams(window.location.search);
      const queryUrl = normalizeSocketUrl(query.get("server") || query.get("socketUrl"));
      if (queryUrl) {
        localStorage.setItem("bubbleBangSocketUrl", queryUrl);
        return queryUrl;
      }
      return normalizeSocketUrl(localStorage.getItem("bubbleBangSocketUrl"));
    }

    setServerUrl(value) {
      const nextUrl = normalizeSocketUrl(value);
      if (nextUrl) {
        localStorage.setItem("bubbleBangSocketUrl", nextUrl);
      } else {
        localStorage.removeItem("bubbleBangSocketUrl");
      }
      if (nextUrl !== this.serverUrl && this.socket) {
        this.socket.disconnect();
        this.socket = null;
        this.playerId = null;
        this.roomCode = "";
      }
      this.serverUrl = nextUrl;
    }

    ensureSocket() {
      if (!window.io) {
        this.game.setMultiplayerStatus("Socket.IO client failed to load. Check your network connection.");
        return false;
      }
      if (this.socket) return true;

      this.socket = window.io(this.url, {
        autoConnect: false,
        transports: ["websocket"],
        upgrade: false,
      });

      this.socket.on("connect", () => {
        this.updateTransport();
        this.startLatencyProbe();
        this.game.setMultiplayerStatus("Connected.");
        if (this.pendingConnectAction) {
          const action = this.pendingConnectAction;
          this.pendingConnectAction = null;
          action();
        }
      });

      this.socket.on("connect_error", () => {
        this.game.setMultiplayerStatus(`Server unavailable at ${this.url}. Check the Server URL.`);
      });

      this.socket.on("disconnect", () => {
        this.stopLatencyProbe();
        if (isMultiplayerState(this.game.state)) {
          this.game.handleMultiplayerDisconnect("Disconnected from server.");
        }
      });

      this.socket.on("room_created", (payload) => {
        this.playerId = payload.playerId;
        this.roomCode = payload.roomCode;
        this.game.handleRoomJoined(payload.roomCode, "Room created. Waiting for player 2.");
      });

      this.socket.on("room_joined", (payload) => {
        this.playerId = payload.playerId;
        this.roomCode = payload.roomCode;
        this.game.handleRoomJoined(payload.roomCode, "Joined room.");
      });

      this.socket.on("room_error", (payload) => {
        this.game.setMultiplayerStatus(payload.message || "Room error.");
      });

      this.socket.on("waiting_for_player", (payload) => {
        this.game.handleWaitingForPlayer(payload);
      });

      this.socket.on("countdown", (payload) => {
        this.game.setMultiplayerStatus(`Starting in ${payload.value}`);
      });

      this.socket.on("snapshot", (snapshot) => {
        this.game.receiveMultiplayerSnapshot(snapshot);
      });

      this.socket.on("player_disconnected", (payload) => {
        this.game.handleMultiplayerDisconnect(payload.message || "Other player disconnected.");
      });

      this.socket.on("game_over", (payload) => {
        this.game.setMultiplayerStatus(`Game over. Score ${payload.score || 0}.`);
      });

      this.socket.on("level_complete", (payload) => {
        this.game.setMultiplayerStatus(
          payload.demoComplete ? "Demo complete." : `Level ${payload.level} complete.`
        );
      });

      return true;
    }

    updateTransport() {
      this.transport = this.socket?.io?.engine?.transport?.name || "websocket";
      this.game.updateNetworkStats({ transport: this.transport });
    }

    startLatencyProbe() {
      this.stopLatencyProbe();
      this.latencyTimer = setInterval(() => {
        if (!this.socket || !this.socket.connected) return;
        const sentAt = performance.now();
        this.socket.timeout(1500).emit("latency_probe", {}, (error) => {
          if (error) return;
          this.game.updateNetworkStats({
            rtt: Math.round(performance.now() - sentAt),
            transport: this.transport,
          });
        });
      }, 1000);
    }

    stopLatencyProbe() {
      if (!this.latencyTimer) return;
      clearInterval(this.latencyTimer);
      this.latencyTimer = null;
    }

    connectThen(action) {
      if (!this.ensureSocket()) return;
      if (this.socket.connected) {
        action();
        return;
      }
      this.pendingConnectAction = action;
      this.socket.connect();
    }

    createRoom(nickname) {
      this.connectThen(() => {
        this.socket.emit("create_room", { nickname: sanitizeNickname(nickname) });
      });
    }

    joinRoom(roomCode, nickname) {
      const code = sanitizeRoomCode(roomCode);
      if (code.length < 4) {
        this.game.setMultiplayerStatus("Enter a 4-6 character room code.");
        return;
      }
      this.connectThen(() => {
        this.socket.emit("join_room", { roomCode: code, nickname: sanitizeNickname(nickname) });
      });
    }

    sendInput(input) {
      if (!this.socket || !this.socket.connected || !this.roomCode) return;
      const payload = {
        left: Boolean(input.left),
        right: Boolean(input.right),
        shoot: Boolean(input.shoot),
        shootPressed: Boolean(input.shootPressed),
      };
      if (input.player) {
        payload.x = Math.round(Number(input.player.x) * 100) / 100;
        payload.y = Math.round(Number(input.player.y) * 100) / 100;
      }

      const now = performance.now();
      const controlsPayload = JSON.stringify({
        left: payload.left,
        right: payload.right,
        shoot: payload.shoot,
        shootPressed: payload.shootPressed,
      });
      const controlsChanged = controlsPayload !== this.lastInputControlsPayload;
      const hasPosition = Number.isFinite(payload.x) && Number.isFinite(payload.y);
      const positionChanged =
        hasPosition &&
        (this.lastSentPlayerX === null ||
          Math.abs(payload.x - this.lastSentPlayerX) > 0.25 ||
          Math.abs(payload.y - this.lastSentPlayerY) > 0.25);
      const positionDue =
        positionChanged && now - this.lastInputSentAt >= MULTIPLAYER_INPUT_SEND_INTERVAL_MS;

      if (!input.force && !controlsChanged && !payload.shootPressed && !positionDue) return;

      payload.seq = ++this.inputSequence;
      this.lastInputControlsPayload = controlsPayload;
      this.lastInputPayload = JSON.stringify(payload);
      this.lastInputSentAt = now;
      if (hasPosition) {
        this.lastSentPlayerX = payload.x;
        this.lastSentPlayerY = payload.y;
      }
      this.socket.emit("player_input", payload);
    }

    leaveRoom() {
      if (this.socket && this.socket.connected && this.roomCode) {
        this.socket.emit("leave_room");
      }
      this.playerId = null;
      this.roomCode = "";
      this.lastInputPayload = "";
      this.lastInputControlsPayload = "";
      this.lastInputSentAt = 0;
      this.lastSentPlayerX = null;
      this.lastSentPlayerY = null;
    }

    restartRoom() {
      if (!this.socket || !this.socket.connected || !this.roomCode) return;
      this.socket.emit("restart_room", { roomCode: this.roomCode });
    }
  }

  class Game {
    constructor() {
      this.root = document.getElementById("game-root");
      this.canvas = document.getElementById("game-canvas");
      this.ctx = this.canvas.getContext("2d");
      this.hud = {
        level: document.getElementById("hud-level"),
        lives: document.getElementById("hud-lives"),
        balls: document.getElementById("hud-balls"),
        time: document.getElementById("hud-time"),
        power: document.getElementById("hud-power"),
        score: document.getElementById("hud-score"),
        ping: document.getElementById("hud-ping"),
      };
      this.ui = {
        statePanel: document.getElementById("state-panel"),
        title: document.getElementById("state-title"),
        subtitle: document.getElementById("state-subtitle"),
        controls: document.getElementById("state-controls"),
        menuActions: document.getElementById("menu-actions"),
        multiplayerForm: document.getElementById("multiplayer-form"),
        roomPanel: document.getElementById("room-panel"),
        nicknameInput: document.getElementById("nickname-input"),
        roomCodeInput: document.getElementById("room-code-input"),
        socketUrlInput: document.getElementById("socket-url-input"),
        connectionStatus: document.getElementById("connection-status"),
        roomCodeDisplay: document.getElementById("room-code-display"),
        playerList: document.getElementById("player-list"),
        restartRoomButton: document.getElementById("restart-room-button"),
      };

      this.input = new InputManager(this);
      this.player = new Player();
      this.levelManager = new LevelManager();
      this.particles = new ParticleSystem();
      this.sound = new SoundEngine();
      this.multiplayer = new SocketClient(this);
      this.balls = [];
      this.projectiles = [];
      this.powerUps = [];
      this.playerPowerUps = { [POWERUP_DOUBLE_SHOT]: 0 };
      this.platforms = [];
      this.score = 0;
      this.levelClearBonus = 1500;
      this.levelTimeLeft = LEVEL_TIME_SECONDS;
      this.shake = 0;
      this.lastTime = 0;
      this.state = STATE.MENU;
      this.mode = "single";
      this.multiplayerStatus = "";
      this.multiplayerSnapshot = null;
      this.multiplayerSnapshots = [];
      this.serverClockOffset = null;
      this.currentMultiplayerInput = { left: false, right: false, shoot: false };
      this.localPlayerVisual = null;
      this.localProjectiles = [];
      this.powerUps = [];
      this.previousMultiplayerShoot = false;
      this.localShotCooldown = 0;
      this.networkStats = { rtt: null, transport: "--", snapshotMs: null };
      this.lastSnapshotArrivedAt = null;
      this.waitingPlayers = [];
      this.ping = null;
      this.prevMultiplayerRenderX = new Map();

      this.bindMenuButtons();
      this.ui.socketUrlInput.value = this.multiplayer.serverUrl || this.multiplayer.url;
      window.addEventListener("resize", () => this.fitCanvas());
      window.addEventListener("orientationchange", () => this.fitCanvas());
      this.fitCanvas();
      if (typeof BubbleBangSprites !== "undefined") {
        BubbleBangSprites.loadSpriteSheet();
      }
      this.updateOverlay();
      requestAnimationFrame((time) => this.loop(time));
    }

    bindMenuButtons() {
      document.getElementById("single-player-button").addEventListener("click", () => {
        this.sound.unlock();
        this.startNewRun();
      });
      document.getElementById("multiplayer-button").addEventListener("click", () => this.showMultiplayerMenu());
      document.getElementById("back-menu-button").addEventListener("click", () => this.showMainMenu());
      document.getElementById("create-room-button").addEventListener("click", () => {
        this.sound.unlock();
        document.activeElement?.blur();
        this.setMultiplayerStatus("Connecting...");
        this.multiplayer.setServerUrl(this.ui.socketUrlInput.value);
        this.multiplayer.createRoom(this.ui.nicknameInput.value);
      });
      document.getElementById("join-room-button").addEventListener("click", () => {
        this.sound.unlock();
        document.activeElement?.blur();
        this.setMultiplayerStatus("Connecting...");
        this.multiplayer.setServerUrl(this.ui.socketUrlInput.value);
        this.multiplayer.joinRoom(this.ui.roomCodeInput.value, this.ui.nicknameInput.value);
      });
      document.getElementById("leave-room-button").addEventListener("click", () => {
        this.multiplayer.leaveRoom();
        this.showMultiplayerMenu("Left room.");
      });
      document.getElementById("restart-room-button").addEventListener("click", () => {
        this.multiplayer.restartRoom();
      });
      document.getElementById("copy-room-button").addEventListener("click", () => {
        this.copyRoomCode();
      });
      this.ui.multiplayerForm.addEventListener("submit", (event) => event.preventDefault());
      this.ui.roomCodeInput.addEventListener("input", () => {
        this.ui.roomCodeInput.value = sanitizeRoomCode(this.ui.roomCodeInput.value);
      });
      this.ui.socketUrlInput.addEventListener("change", () => {
        const normalized = normalizeSocketUrl(this.ui.socketUrlInput.value);
        this.multiplayer.setServerUrl(normalized);
        this.ui.socketUrlInput.value = normalized || this.multiplayer.url;
      });
    }

    fitCanvas() {
      const scale = Math.min(window.innerWidth / WIDTH, window.innerHeight / HEIGHT);
      const cssWidth = Math.floor(WIDTH * scale);
      const cssHeight = Math.floor(HEIGHT * scale);
      this.canvas.style.width = `${cssWidth}px`;
      this.canvas.style.height = `${cssHeight}px`;
    }

    loop(time) {
      const dt = Math.min((time - this.lastTime) / 1000 || 0, 1 / 30);
      this.lastTime = time;
      const actions = this.input.consumeFrameActions();
      this.handleGlobalInput(actions);
      this.update(dt, actions);
      this.syncMusicState();
      this.render();
      requestAnimationFrame((nextTime) => this.loop(nextTime));
    }

    handleGlobalInput(actions) {
      if (actions.pause) {
        this.togglePause();
      }
      if (!actions.confirm) return;

      if (this.state === STATE.MENU) {
        this.sound.unlock();
        this.startNewRun();
      } else if (this.state === STATE.GAME_OVER || this.state === STATE.DEMO_COMPLETE) {
        this.sound.unlock();
        this.startNewRun();
      } else if (this.state === STATE.LEVEL_COMPLETE) {
        this.advanceLevel();
      } else if (this.state === STATE.MP_GAME_OVER) {
        this.multiplayer.restartRoom();
      }
    }

    togglePause() {
      if (this.state === STATE.PLAYING) {
        this.state = STATE.PAUSED;
      } else if (this.state === STATE.PAUSED) {
        this.state = STATE.PLAYING;
      }
      this.updateOverlay();
    }

    syncMusicState() {
      const shouldPlay = [
        STATE.PLAYING,
        STATE.LEVEL_COMPLETE,
        STATE.MP_COUNTDOWN,
        STATE.MP_PLAYING,
        STATE.MP_LEVEL_COMPLETE,
      ].includes(this.state);
      if (shouldPlay) {
        this.sound.startMusic();
      } else {
        this.sound.stopMusic();
      }
    }

    showMainMenu(message = "") {
      this.mode = "single";
      this.state = STATE.MENU;
      this.multiplayerStatus = message;
      this.multiplayerSnapshot = null;
      this.multiplayerSnapshots = [];
      this.serverClockOffset = null;
      this.localPlayerVisual = null;
      this.localProjectiles = [];
      this.powerUps = [];
      this.previousMultiplayerShoot = false;
      this.localShotCooldown = 0;
      this.prevMultiplayerRenderX.clear();
      this.waitingPlayers = [];
      this.updateOverlay();
    }

    showMultiplayerMenu(message = "") {
      this.mode = "multiplayer";
      this.state = STATE.MULTIPLAYER_MENU;
      this.multiplayerStatus = message || "Create a room or join a friend's code.";
      this.multiplayerSnapshot = null;
      this.multiplayerSnapshots = [];
      this.serverClockOffset = null;
      this.localPlayerVisual = null;
      this.localProjectiles = [];
      this.powerUps = [];
      this.previousMultiplayerShoot = false;
      this.localShotCooldown = 0;
      this.prevMultiplayerRenderX.clear();
      this.waitingPlayers = [];
      this.updateOverlay();
    }

    startNewRun() {
      this.mode = "single";
      this.score = 0;
      this.player.resetForRun();
      this.playerPowerUps = { [POWERUP_DOUBLE_SHOT]: 0 };
      this.levelManager.reset();
      this.loadCurrentLevel();
      this.state = STATE.PLAYING;
      this.updateOverlay();
    }

    loadCurrentLevel() {
      const level = this.levelManager.current;
      this.player.resetPosition();
      this.player.invulnerable = 1.2;
      this.projectiles = [];
      this.powerUps = [];
      this.platforms = level.platforms.map((platform) => ({ ...platform }));
      this.balls = level.balls.map((ball) => new Ball(ball));
      this.levelTimeLeft = LEVEL_TIME_SECONDS;
      this.particles.particles = [];
      this.shake = 0;
      this.updateHud();
    }

    advanceLevel() {
      if (!this.levelManager.next()) {
        this.state = STATE.DEMO_COMPLETE;
        this.updateOverlay();
        return;
      }
      this.loadCurrentLevel();
      this.state = STATE.PLAYING;
      this.updateOverlay();
    }

    update(dt, actions) {
      this.shake = Math.max(0, this.shake - dt * 22);
      this.particles.update(dt);

      if (isMultiplayerState(this.state)) {
        this.updateMultiplayer(dt, actions);
        return;
      }

      if (this.state !== STATE.PLAYING) {
        this.updateHud();
        return;
      }

      this.player.update(dt, actions, this.platforms);
      this.updatePowerUpTimers(dt);
      if (this.updateLevelTimer(dt)) {
        this.updateHud();
        return;
      }

      if (actions.shoot || actions.shootPressed) {
        this.trySpawnPlayerProjectile();
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
      this.updateHud();
    }

    updatePowerUpTimers(dt) {
      for (const key of Object.keys(this.playerPowerUps)) {
        this.playerPowerUps[key] = Math.max(0, this.playerPowerUps[key] - dt);
      }
    }

    updateLevelTimer(dt) {
      this.levelTimeLeft = Math.max(0, this.levelTimeLeft - dt);
      if (this.levelTimeLeft > 0) return false;
      this.handleLevelTimeout();
      return true;
    }

    handleLevelTimeout() {
      this.player.lives = Math.max(0, this.player.lives - 1);
      this.clearPlayerPowerUps();
      this.projectiles = [];
      this.powerUps = [];
      this.playSoundCue("timeout");
      if (this.player.lives <= 0) {
        this.shake = 10;
        this.particles.burst(this.player.shootX, this.player.y + 25, "#ffd166", 28);
        this.state = STATE.GAME_OVER;
        this.updateOverlay();
        return;
      }
      this.loadCurrentLevel();
      this.shake = 10;
      this.particles.burst(this.player.shootX, this.player.y + 25, "#ffd166", 28);
    }

    clearPlayerPowerUps() {
      this.playerPowerUps = { [POWERUP_DOUBLE_SHOT]: 0 };
    }

    getMaxPlayerProjectiles() {
      return this.playerPowerUps[POWERUP_DOUBLE_SHOT] > 0 ? 2 : 1;
    }

    trySpawnPlayerProjectile() {
      const maxProjectiles = this.getMaxPlayerProjectiles();
      if (this.projectiles.length >= maxProjectiles) return;
      const laneOffset = maxProjectiles > 1 ? (this.projectiles.length % 2 === 0 ? -8 : 8) : 0;
      this.projectiles.push(new Projectile(this.player.shootX + laneOffset, this.player.y + 14));
      this.playSoundCue("shoot");
    }

    maybeDropPowerUp(ball) {
      if (ball.size === "tiny" || this.powerUps.length >= 2) return;
      const candidates = [];
      if (this.player.lives < MAX_PLAYER_LIVES) {
        candidates.push({ type: POWERUP_HEART, chance: HEART_DROP_CHANCE });
      }
      if (this.playerPowerUps[POWERUP_DOUBLE_SHOT] <= 0) {
        candidates.push({ type: POWERUP_DOUBLE_SHOT, chance: POWERUP_DROP_CHANCE });
      }
      const totalChance = candidates.reduce((sum, candidate) => sum + candidate.chance, 0);
      let roll = Math.random();
      if (roll > totalChance) return;
      for (const candidate of candidates) {
        if (roll <= candidate.chance) {
          this.powerUps.push(new PowerUp({ type: candidate.type, x: ball.x, y: ball.y }));
          return;
        }
        roll -= candidate.chance;
      }
    }

    handlePowerUpCollections() {
      for (const powerUp of this.powerUps) {
        if (!powerUp.active || !rectOverlap(powerUp.rect, this.player.rect)) continue;
        powerUp.active = false;
        const pickupX = powerUp.x + powerUp.width * 0.5;
        const pickupY = powerUp.y + powerUp.height * 0.5;
        if (powerUp.type === POWERUP_HEART) {
          this.player.lives = Math.min(MAX_PLAYER_LIVES, this.player.lives + 1);
          this.score += 300;
          this.particles.burst(pickupX, pickupY, "#ff788a", 22);
          this.playSoundCue("heart");
        } else {
          this.playerPowerUps[powerUp.type] = POWERUP_DURATION;
          this.score += 250;
          this.particles.burst(pickupX, pickupY, "#ffd166", 18);
          this.playSoundCue("powerup");
        }
      }
    }

    updateMultiplayer(dt, actions) {
      this.currentMultiplayerInput = {
        left: actions.left,
        right: actions.right,
        shoot: actions.shoot,
      };
      this.localShotCooldown = Math.max(0, this.localShotCooldown - dt);
      this.updateLocalPlayerControl(dt, actions);
      this.updateLocalProjectiles(dt);
      if (this.state === STATE.MP_PLAYING) {
        this.multiplayer.sendInput({
          ...actions,
          player: this.getLocalPlayerInputState(),
        });
        if (actions.shootPressed && this.localShotCooldown <= 0) {
          this.spawnLocalProjectile();
        }
      }
      this.previousMultiplayerShoot = actions.shoot;
      this.updateHud();
    }

    updateLocalPlayerControl(dt, actions) {
      const latestPlayer = this.multiplayerSnapshot?.players?.find(
        (player) => player.id === this.multiplayer.playerId
      );
      if (!latestPlayer) return;

      if (!this.localPlayerVisual || this.localPlayerVisual.id !== latestPlayer.id) {
        this.syncLocalPlayerVisual(latestPlayer);
      }

      if (this.state !== STATE.MP_PLAYING) {
        this.syncLocalPlayerVisual(latestPlayer);
        return;
      }

      const direction = (actions.right ? 1 : 0) - (actions.left ? 1 : 0);
      const width = latestPlayer.width || 46;
      const height = latestPlayer.height || 58;
      const oldX = this.localPlayerVisual.x;
      this.localPlayerVisual.x = clamp(
        this.localPlayerVisual.x + direction * MULTIPLAYER_PLAYER_SPEED * dt,
        14,
        WIDTH - width - 14
      );
      const platforms = this.multiplayerSnapshot?.platforms || [];
      applyPlayerVertical(this.localPlayerVisual, dt, {}, platforms);
      const serverY = latestPlayer.y;
      if (Math.abs(this.localPlayerVisual.y - serverY) > MP_PLAYER_Y_SNAP) {
        this.localPlayerVisual.y = serverY;
        this.localPlayerVisual.vy = Number(latestPlayer.vy) || 0;
      }
      this.localPlayerVisual.width = width;
      this.localPlayerVisual.height = height;
      this.localPlayerVisual.powerUps = { ...(latestPlayer.powerUps || {}) };
      if (direction !== 0) {
        this.localPlayerVisual.facing = direction < 0 ? "left" : "right";
        this.localPlayerVisual.lastMovedAt = performance.now();
      } else {
        this.localPlayerVisual.facing = latestPlayer.facing || this.localPlayerVisual.facing || "right";
      }

      const playerRect = {
        x: this.localPlayerVisual.x + 5,
        y: this.localPlayerVisual.y + 6,
        width: width - 10,
        height: height - 6,
      };
      for (const platform of platforms) {
        if (!rectOverlap(playerRect, platform)) continue;
        if (this.localPlayerVisual.x > oldX) this.localPlayerVisual.x = platform.x - width + 5;
        if (this.localPlayerVisual.x < oldX) this.localPlayerVisual.x = platform.x + platform.width - 5;
      }

      const oldX2 = this.localPlayerVisual.x;
      const playerRect2 = {
        x: this.localPlayerVisual.x + 5,
        y: this.localPlayerVisual.y + 6,
        width: width - 10,
        height: height - 6,
      };
      for (const platform of platforms) {
        if (!rectOverlap(playerRect2, platform)) continue;
        if (this.localPlayerVisual.x > oldX2) this.localPlayerVisual.x = platform.x - width + 5;
        if (this.localPlayerVisual.x < oldX2) this.localPlayerVisual.x = platform.x + platform.width - 5;
      }
    }

    syncLocalPlayerVisual(player) {
      this.localPlayerVisual = {
        id: player.id,
        x: player.x,
        y: player.y,
        width: player.width || 46,
        height: player.height || 58,
        vy: Number(player.vy) || 0,
        onGround: player.onGround !== false,
        powerUps: { ...(player.powerUps || {}) },
        facing: player.facing || "right",
        lastMovedAt: 0,
      };
    }

    getLocalPlayerInputState() {
      const latestPlayer = this.multiplayerSnapshot?.players?.find(
        (player) => player.id === this.multiplayer.playerId
      );
      const player = this.localPlayerVisual || latestPlayer;
      if (!player) return null;
      return {
        x: player.x,
        y: player.y,
      };
    }

    updateLocalProjectiles(dt) {
      for (const projectile of this.localProjectiles) {
        projectile.y -= LOCAL_PROJECTILE_SPEED * dt;
        projectile.height = projectile.originY - projectile.y;
      }
      this.localProjectiles = this.localProjectiles.filter((projectile) => projectile.y > 20);
    }

    spawnLocalProjectile() {
      const player = this.localPlayerVisual || this.multiplayerSnapshot?.players?.find(
        (candidate) => candidate.id === this.multiplayer.playerId
      );
      if (!player) return;
      const maxProjectiles = player.powerUps?.[POWERUP_DOUBLE_SHOT] > 0 ? 2 : 1;
      const localCount = this.localProjectiles.filter(
        (projectile) => projectile.ownerId === this.multiplayer.playerId
      ).length;
      const serverCount =
        this.multiplayerSnapshot?.projectiles?.filter(
          (projectile) => projectile.ownerId === this.multiplayer.playerId
        ).length || 0;
      const ownedCount = localCount + serverCount;
      if (ownedCount >= maxProjectiles) return;
      const width = player.width || 46;
      const laneOffset = maxProjectiles > 1 ? (ownedCount % 2 === 0 ? -8 : 8) : 0;
      this.localProjectiles.push({
        id: `local-${performance.now()}`,
        ownerId: this.multiplayer.playerId,
        x: player.x + width * 0.5 + laneOffset,
        y: player.y + 14,
        originY: player.y + 14,
        height: 0,
      });
      this.localShotCooldown = LOCAL_SHOT_COOLDOWN;
    }

    handleProjectileCollisions() {
      for (let projectileIndex = this.projectiles.length - 1; projectileIndex >= 0; projectileIndex -= 1) {
        const projectile = this.projectiles[projectileIndex];
        for (let ballIndex = this.balls.length - 1; ballIndex >= 0; ballIndex -= 1) {
          const ball = this.balls[ballIndex];
          if (!lineCircleOverlap(projectile.rect, ball)) continue;
          ball.hitFlash = 0.12;
          this.score += ball.type.score;
          this.particles.burst(ball.x, ball.y, ball.type.color, ball.size === "tiny" ? 16 : 24);
          this.shake = ball.size === "large" ? 8 : 5;
          this.playSoundCue("pop");
          this.maybeDropPowerUp(ball);
          const splitBalls = ball.split(this.player.rect);
          this.balls.splice(ballIndex, 1, ...splitBalls);
          this.projectiles.splice(projectileIndex, 1);
          return;
        }
      }
    }

    handlePlayerCollisions() {
      const playerRect = this.player.rect;
      for (const ball of this.balls) {
        if (!circleRectOverlap(ball, playerRect)) continue;
        if (!this.player.takeHit()) return;
        this.clearPlayerPowerUps();
        this.projectiles = [];
        this.powerUps = [];
        this.shake = 10;
        this.particles.burst(this.player.shootX, this.player.y + 25, "#f8fbff", 26);
        this.playSoundCue("hurt");
        if (this.player.lives <= 0) {
          this.state = STATE.GAME_OVER;
          this.updateOverlay();
        }
        return;
      }
    }

    checkLevelClear() {
      if (this.balls.length > 0) return;
      this.score +=
        this.levelClearBonus +
        this.levelManager.currentNumber * 250 +
        Math.ceil(this.levelTimeLeft) * LEVEL_CLEAR_TIME_BONUS;
      this.projectiles = [];
      this.powerUps = [];
      this.state = STATE.LEVEL_COMPLETE;
      this.playSoundCue("clear");
      this.updateOverlay();
    }

    playSoundCue(name) {
      this.sound.play(name);
    }

    handleRoomJoined(roomCode, message) {
      document.activeElement?.blur();
      this.mode = "multiplayer";
      this.state = STATE.MP_WAITING;
      this.multiplayerStatus = message;
      this.multiplayerSnapshot = null;
      this.multiplayerSnapshots = [];
      this.serverClockOffset = null;
      this.localPlayerVisual = null;
      this.localProjectiles = [];
      this.previousMultiplayerShoot = false;
      this.localShotCooldown = 0;
      this.prevMultiplayerRenderX.clear();
      this.ui.roomCodeInput.value = roomCode;
      this.updateOverlay();
    }

    handleWaitingForPlayer(payload) {
      this.mode = "multiplayer";
      this.state = STATE.MP_WAITING;
      this.waitingPlayers = payload.players || [];
      this.multiplayer.roomCode = payload.roomCode || this.multiplayer.roomCode;
      this.updateOverlay();
    }

    receiveMultiplayerSnapshot(snapshot) {
      if (!snapshot || !snapshot.roomCode) return;
      if (this.multiplayer.roomCode && snapshot.roomCode !== this.multiplayer.roomCode) return;
      this.mode = "multiplayer";
      const previousSnapshot = this.multiplayerSnapshot;
      this.multiplayerSnapshot = snapshot;
      const latestLocalPlayer = snapshot.players?.find((player) => player.id === this.multiplayer.playerId);
      const shouldReseedLocalPlayer =
        latestLocalPlayer &&
        (!this.localPlayerVisual ||
          this.localPlayerVisual.id !== latestLocalPlayer.id ||
          previousSnapshot?.level !== snapshot.level ||
          snapshot.gameState !== "playing");
      if (shouldReseedLocalPlayer) {
        this.syncLocalPlayerVisual(latestLocalPlayer);
      }
      const now = Date.now();
      if (this.lastSnapshotArrivedAt !== null) {
        this.networkStats.snapshotMs = Math.round(now - this.lastSnapshotArrivedAt);
      }
      this.lastSnapshotArrivedAt = now;
      const measuredOffset = snapshot.serverTime - now;
      this.serverClockOffset =
        this.serverClockOffset === null
          ? measuredOffset
          : this.serverClockOffset + (measuredOffset - this.serverClockOffset) * 0.08;
      this.ping = Math.max(0, now - snapshot.serverTime);
      this.multiplayerSnapshots.push(snapshot);
      this.multiplayerSnapshots = this.multiplayerSnapshots
        .filter((item) => item.roomCode === snapshot.roomCode && now + this.serverClockOffset - item.serverTime < 1200)
        .sort((a, b) => a.serverTime - b.serverTime)
        .slice(-12);
      this.processServerEvents(snapshot.events || []);
      if (snapshot.gameState === "waiting") this.state = STATE.MP_WAITING;
      if (snapshot.gameState === "countdown") this.state = STATE.MP_COUNTDOWN;
      if (snapshot.gameState === "playing") this.state = STATE.MP_PLAYING;
      if (snapshot.gameState === "levelComplete") this.state = STATE.MP_LEVEL_COMPLETE;
      if (snapshot.gameState === "gameOver") this.state = STATE.MP_GAME_OVER;
      this.updateOverlay();
    }

    updateNetworkStats(stats) {
      this.networkStats = {
        ...this.networkStats,
        ...stats,
      };
      this.updateHud();
    }

    processServerEvents(events) {
      for (const event of events) {
        if (event.type === "ball_hit") {
          const color = event.color || BALL_TYPES[event.size]?.color || "#77f3ff";
          this.particles.burst(event.x, event.y, color, event.size === "tiny" ? 16 : 24);
          this.shake = event.size === "large" ? 8 : 5;
          this.playSoundCue("pop");
          if (event.ownerId) {
            this.localProjectiles = this.localProjectiles.filter(
              (projectile) => projectile.ownerId !== event.ownerId
            );
          }
        } else if (event.type === "player_hit") {
          this.particles.burst(event.x, event.y, "#f8fbff", 26);
          this.shake = 10;
          this.playSoundCue("hurt");
        } else if (event.type === "power_up") {
          const isHeart = event.powerUp === POWERUP_HEART;
          this.particles.burst(event.x, event.y, isHeart ? "#ff788a" : "#ffd166", isHeart ? 22 : 18);
          this.playSoundCue(isHeart ? "heart" : "powerup");
        } else if (event.type === "timer_expired") {
          this.shake = 10;
          this.playSoundCue("timeout");
        } else if (event.type === "shoot") {
          this.playSoundCue("shoot");
        }
      }
    }

    getRenderableMultiplayerSnapshot() {
      if (this.multiplayerSnapshots.length === 0) return this.multiplayerSnapshot;
      if (this.multiplayerSnapshots.length === 1 || this.serverClockOffset === null) {
        return this.multiplayerSnapshots[this.multiplayerSnapshots.length - 1];
      }

      const renderTime = Date.now() + this.serverClockOffset - MULTIPLAYER_INTERPOLATION_DELAY_MS;
      let previous = this.multiplayerSnapshots[0];
      let next = null;

      for (let i = 0; i < this.multiplayerSnapshots.length - 1; i += 1) {
        const a = this.multiplayerSnapshots[i];
        const b = this.multiplayerSnapshots[i + 1];
        if (a.serverTime <= renderTime && b.serverTime >= renderTime) {
          previous = a;
          next = b;
          break;
        }
        if (b.serverTime < renderTime) {
          previous = b;
        }
      }

      const baseSnapshot = next
        ? interpolateSnapshot(
            previous,
            next,
            clamp((renderTime - previous.serverTime) / Math.max(1, next.serverTime - previous.serverTime), 0, 1)
          )
        : this.multiplayerSnapshots[this.multiplayerSnapshots.length - 1];

      return baseSnapshot;
    }

    getLocalAuthoritativePlayer(interpolatedPlayer) {
      const latestPlayer = this.multiplayerSnapshot?.players?.find(
        (player) => player.id === this.multiplayer.playerId
      );
      if (!latestPlayer) return interpolatedPlayer;

      const direction =
        (this.currentMultiplayerInput.right ? 1 : 0) - (this.currentMultiplayerInput.left ? 1 : 0);

      if (!this.localPlayerVisual || this.localPlayerVisual.id !== latestPlayer.id) {
        this.syncLocalPlayerVisual(latestPlayer);
      }

      const serverError = Math.abs(latestPlayer.x - this.localPlayerVisual.x);
      if (serverError > SERVER_CORRECTION_SNAP_DISTANCE) {
        this.syncLocalPlayerVisual(latestPlayer);
      }

      return {
        ...(interpolatedPlayer || latestPlayer),
        ...latestPlayer,
        x: this.localPlayerVisual.x,
        y: this.localPlayerVisual.y,
        vy: this.localPlayerVisual.vy,
        onGround: this.localPlayerVisual.onGround,
        facing:
          direction < 0
            ? "left"
            : direction > 0
              ? "right"
              : this.localPlayerVisual.facing || latestPlayer.facing || interpolatedPlayer?.facing || "right",
      };
    }

    handleMultiplayerDisconnect(message) {
      this.multiplayer.leaveRoom();
      this.mode = "single";
      this.state = STATE.MENU;
      this.multiplayerStatus = message;
      this.multiplayerSnapshot = null;
      this.multiplayerSnapshots = [];
      this.serverClockOffset = null;
      this.localPlayerVisual = null;
      this.localProjectiles = [];
      this.previousMultiplayerShoot = false;
      this.localShotCooldown = 0;
      this.prevMultiplayerRenderX.clear();
      this.waitingPlayers = [];
      this.updateOverlay();
    }

    setMultiplayerStatus(message) {
      this.multiplayerStatus = message;
      this.updateOverlay();
    }

    copyRoomCode() {
      const code = this.multiplayer.roomCode || this.multiplayerSnapshot?.roomCode || "";
      if (!code) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(
          () => this.setMultiplayerStatus("Room code copied."),
          () => this.setMultiplayerStatus(`Room code: ${code}`)
        );
      } else {
        this.setMultiplayerStatus(`Room code: ${code}`);
      }
    }

    updateHud() {
      if (isMultiplayerState(this.state) && this.multiplayerSnapshot) {
        const snapshot = this.multiplayerSnapshot;
        const localPlayer = snapshot.players?.find((player) => player.id === this.multiplayer.playerId);
        const doubleTime = Math.ceil(localPlayer?.powerUps?.[POWERUP_DOUBLE_SHOT] || 0);
        const timeLeft = Math.ceil(snapshot.timeLeft ?? LEVEL_TIME_SECONDS);
        this.hud.level.textContent = `Room ${snapshot.roomCode} - L${snapshot.level}`;
        this.hud.lives.textContent = `Team Lives ${Math.max(0, snapshot.teamLives)}/${snapshot.teamMaxLives || MAX_PLAYER_LIVES}`;
        this.hud.time.textContent = `Time ${timeLeft}`;
        this.hud.balls.textContent = `Balls ${snapshot.balls.length}`;
        this.hud.power.textContent = `Double ${doubleTime}`;
        this.hud.power.classList.toggle("hidden", doubleTime <= 0);
        this.hud.time.classList.toggle("warning", timeLeft <= 10 && snapshot.gameState === "playing");
        this.hud.score.textContent = snapshot.score.toString().padStart(6, "0");
        const rtt = this.networkStats.rtt === null ? "--" : `${this.networkStats.rtt}ms`;
        const snapshotMs = this.networkStats.snapshotMs === null ? "--" : `${this.networkStats.snapshotMs}ms`;
        this.hud.ping.textContent = `RTT ${rtt} ${this.networkStats.transport} S ${snapshotMs}`;
        return;
      }

      const doubleTime = Math.ceil(this.playerPowerUps[POWERUP_DOUBLE_SHOT] || 0);
      const timeLeft = Math.ceil(this.levelTimeLeft);
      this.hud.level.textContent = `Level ${this.levelManager.currentNumber}`;
      this.hud.lives.textContent = `Lives ${Math.max(0, this.player.lives)}/${MAX_PLAYER_LIVES}`;
      this.hud.time.textContent = `Time ${timeLeft}`;
      this.hud.balls.textContent = `Balls ${this.balls.length}`;
      this.hud.power.textContent = `Double ${doubleTime}`;
      this.hud.power.classList.toggle("hidden", doubleTime <= 0);
      this.hud.time.classList.toggle("warning", timeLeft <= 10 && this.state === STATE.PLAYING);
      this.hud.score.textContent = this.score.toString().padStart(6, "0");
      this.hud.ping.textContent = "Ping --";
    }

    updateOverlay() {
      let visible = true;
      let title = "Bubble Bang MVP";
      let subtitle = this.multiplayerStatus || "Choose a mode";
      let controls = "Move: A/D or Arrows - Shoot: Space - Pause: Esc/P";
      const snapshot = this.multiplayerSnapshot;

      if (this.state === STATE.PLAYING || this.state === STATE.MP_PLAYING) {
        visible = false;
      } else if (this.state === STATE.PAUSED) {
        title = "Paused";
        subtitle = "Press Esc / P or tap pause to resume";
      } else if (this.state === STATE.MULTIPLAYER_MENU) {
        title = "Online Co-op";
        controls = "Create a room, or join a 4-6 character code.";
      } else if (this.state === STATE.LEVEL_COMPLETE) {
        title = `Level ${this.levelManager.currentNumber} Clear`;
        subtitle = this.levelManager.isFinalLevel
          ? "Press Enter / Tap for the demo finale"
          : "Press Enter / Tap for the next level";
      } else if (this.state === STATE.GAME_OVER) {
        title = "Game Over";
        subtitle = "Press Enter / Tap to Restart";
        controls = `Final Score: ${this.score.toString().padStart(6, "0")}`;
      } else if (this.state === STATE.DEMO_COMPLETE) {
        title = "Demo Complete";
        subtitle = "Press Enter / Tap to Restart";
        controls = `Final Score: ${this.score.toString().padStart(6, "0")}`;
      } else if (this.state === STATE.MP_WAITING) {
        const code = this.multiplayer.roomCode || snapshot?.roomCode || "-----";
        title = `Room ${code}`;
        subtitle = this.multiplayerStatus || "Waiting for player 2...";
        controls = "Share the room code with another local browser tab.";
      } else if (this.state === STATE.MP_COUNTDOWN) {
        title = snapshot?.countdown ? String(snapshot.countdown) : "GO";
        subtitle = `Room ${snapshot?.roomCode || this.multiplayer.roomCode}`;
        controls = "Get ready.";
      } else if (this.state === STATE.MP_LEVEL_COMPLETE) {
        title = snapshot?.demoComplete ? "Demo Complete" : `Level ${snapshot?.level || 1} Clear`;
        subtitle = snapshot?.demoComplete ? "Press Restart to play again." : "Next level starts automatically.";
        controls = `Team Score: ${(snapshot?.score || 0).toString().padStart(6, "0")}`;
      } else if (this.state === STATE.MP_GAME_OVER) {
        title = snapshot?.demoComplete ? "Demo Complete" : "Team Game Over";
        subtitle = "Press Restart to play again.";
        controls = `Team Score: ${(snapshot?.score || 0).toString().padStart(6, "0")}`;
      }

      this.root.dataset.state = this.state;
      this.root.dataset.mode = this.mode;
      this.ui.statePanel.classList.toggle("hidden", !visible);
      this.ui.title.textContent = title;
      this.ui.subtitle.textContent = subtitle;
      this.ui.controls.textContent = controls;

      this.ui.menuActions.classList.toggle("hidden", this.state !== STATE.MENU);
      this.ui.multiplayerForm.classList.toggle("hidden", this.state !== STATE.MULTIPLAYER_MENU);
      this.ui.roomPanel.classList.toggle(
        "hidden",
        ![STATE.MP_WAITING, STATE.MP_COUNTDOWN, STATE.MP_LEVEL_COMPLETE, STATE.MP_GAME_OVER].includes(this.state)
      );
      this.ui.restartRoomButton.classList.toggle(
        "hidden",
        ![STATE.MP_LEVEL_COMPLETE, STATE.MP_GAME_OVER].includes(this.state)
      );

      this.updateRoomPanel();
      this.updateHud();
    }

    updateRoomPanel() {
      const snapshot = this.multiplayerSnapshot;
      const code = this.multiplayer.roomCode || snapshot?.roomCode || "-----";
      const players = snapshot?.players || this.waitingPlayers || [];
      this.ui.connectionStatus.textContent = this.multiplayerStatus || "Connected.";
      this.ui.roomCodeDisplay.textContent = `Room ${code}`;
      this.ui.playerList.innerHTML = "";

      if (players.length === 0) {
        const row = document.createElement("div");
        row.className = "player-row";
        row.textContent = "Waiting for players...";
        this.ui.playerList.appendChild(row);
        return;
      }

      for (const player of players) {
        const row = document.createElement("div");
        row.className = "player-row";
        const name = document.createElement("span");
        name.textContent = `${player.nickname || "Player"}${player.id === this.multiplayer.playerId ? " (You)" : ""}`;
        const status = document.createElement("span");
        status.textContent = player.connected === false ? "Offline" : "Ready";
        row.append(name, status);
        this.ui.playerList.appendChild(row);
      }
    }

    render() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      ctx.save();
      if (this.shake > 0) {
        ctx.translate(rand(-this.shake, this.shake), rand(-this.shake, this.shake));
      }

      this.renderBackground(ctx);

      if (isMultiplayerState(this.state)) {
        this.renderMultiplayer(ctx);
      } else {
        this.renderSinglePlayer(ctx);
      }

      this.particles.render(ctx);
      ctx.restore();
    }

    renderSinglePlayer(ctx) {
      for (const platform of this.platforms) {
        this.renderPlatform(ctx, platform);
      }
      for (const projectile of this.projectiles) {
        projectile.render(ctx);
      }
      for (const ball of this.balls) {
        ball.render(ctx);
      }
      for (const powerUp of this.powerUps) {
        powerUp.render(ctx);
      }
      this.player.render(ctx, {
        projectile: this.projectiles.length > 0,
        pose:
          this.state === STATE.LEVEL_COMPLETE || this.state === STATE.DEMO_COMPLETE
            ? "victory"
            : this.state === STATE.GAME_OVER
              ? "defeat"
              : null,
      });
    }

    renderMultiplayer(ctx) {
      const snapshot = this.getRenderableMultiplayerSnapshot();
      const platforms = snapshot?.platforms || [];
      const projectiles = snapshot?.projectiles || [];
      const balls = snapshot?.balls || [];
      const players = snapshot?.players || [];
      const powerUps = snapshot?.powerUps || [];
      const pose =
        snapshot?.gameState === "levelComplete"
          ? "victory"
          : snapshot?.gameState === "gameOver"
            ? "defeat"
            : null;

      for (const platform of platforms) {
        this.renderPlatform(ctx, platform);
      }
      const localProjectileOwners = new Set(this.localProjectiles.map((projectile) => projectile.ownerId));
      for (const projectile of projectiles) {
        if (localProjectileOwners.has(projectile.ownerId)) continue;
        renderProjectileLine(ctx, projectile.x, projectile.y, projectile.y + projectile.height);
      }
      for (const projectile of this.localProjectiles) {
        renderProjectileLine(ctx, projectile.x, projectile.y, projectile.originY);
      }
      for (const ball of balls) {
        renderBallVisual(ctx, ball, 0, 0);
      }
      for (const powerUp of powerUps) {
        renderPowerUpVisual(ctx, powerUp);
      }
      for (const player of players) {
        const isLocal = player.id === this.multiplayer.playerId;
        const renderPlayer = isLocal ? this.getLocalAuthoritativePlayer(player) : player;
        const prevX = this.prevMultiplayerRenderX.get(renderPlayer.id);
        this.prevMultiplayerRenderX.set(renderPlayer.id, renderPlayer.x);
        const direction =
          (this.currentMultiplayerInput.right ? 1 : 0) - (this.currentMultiplayerInput.left ? 1 : 0);
        const isWalking = isLocal
          ? direction !== 0
          : prevX != null && Math.abs(renderPlayer.x - prevX) > 0.35;
        const hasProjectile =
          projectiles.some((projectile) => projectile.ownerId === renderPlayer.id) ||
          this.localProjectiles.some((projectile) => projectile.ownerId === renderPlayer.id);
        renderPlayerShape(ctx, renderPlayer, {
          primary: isLocal ? "#77f3ff" : "#ffd166",
          accent: isLocal ? "#ff5bc8" : "#8cff82",
          showName: true,
          facing: renderPlayer.facing || "right",
          isWalking,
          hasProjectile,
          pose,
          onGround: renderPlayer.onGround !== false,
        });
      }
      const activeIds = new Set(players.map((p) => p.id));
      for (const key of this.prevMultiplayerRenderX.keys()) {
        if (!activeIds.has(key)) this.prevMultiplayerRenderX.delete(key);
      }
    }

    renderBackground(ctx) {
      const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      gradient.addColorStop(0, "#0b2145");
      gradient.addColorStop(0.58, "#08172d");
      gradient.addColorStop(1, "#050910");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = "#77f3ff";
      ctx.lineWidth = 1;
      for (let x = 0; x <= WIDTH; x += 48) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x - 150, FLOOR_Y);
        ctx.stroke();
      }
      ctx.strokeStyle = "#ff5bc8";
      for (let y = 54; y < FLOOR_Y; y += 54) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(WIDTH, y);
        ctx.stroke();
      }
      ctx.restore();

      ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
      for (let i = 0; i < 42; i += 1) {
        const x = (i * 151) % WIDTH;
        const y = 30 + ((i * 89) % 350);
        ctx.fillRect(x, y, 2, 2);
      }

      ctx.fillStyle = "#06101e";
      ctx.fillRect(0, FLOOR_Y, WIDTH, HEIGHT - FLOOR_Y);
      ctx.fillStyle = "rgba(119, 243, 255, 0.28)";
      ctx.fillRect(0, FLOOR_Y, WIDTH, 4);
      ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
      for (let x = 0; x < WIDTH; x += 36) {
        ctx.fillRect(x, FLOOR_Y + 15, 18, 3);
      }
    }

    renderPlatform(ctx, platform) {
      ctx.save();
      ctx.shadowColor = "rgba(119, 243, 255, 0.38)";
      ctx.shadowBlur = 16;
      const grd = ctx.createLinearGradient(platform.x, platform.y, platform.x, platform.y + platform.height);
      grd.addColorStop(0, "#79f3ff");
      grd.addColorStop(0.22, "#d8fcff");
      grd.addColorStop(1, "#1e4d6b");
      ctx.fillStyle = grd;
      roundRect(ctx, platform.x, platform.y, platform.width, platform.height, 8);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.46)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }

  function renderBallVisual(ctx, ball, hitFlash, squash) {
    const type = BALL_TYPES[ball.size] || BALL_TYPES.small;
    const radius = ball.radius || type.radius;
    const scaleY = squash > 0 ? 1 - 0.12 * squash : 1;
    const scaleX = squash > 0 ? 1 + 0.12 * squash : 1;
    const gradient = ctx.createRadialGradient(
      ball.x - radius * 0.35,
      ball.y - radius * 0.45,
      radius * 0.1,
      ball.x,
      ball.y,
      radius
    );
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.18, hitFlash > 0 ? "#ffffff" : type.color);
    gradient.addColorStop(1, "#11162b");

    ctx.save();
    ctx.translate(ball.x, ball.y);
    ctx.scale(scaleX, scaleY);
    ctx.shadowColor = type.glow;
    ctx.shadowBlur = hitFlash > 0 ? 32 : 18;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.72)";
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 255, 255, 0.36)";
    ctx.beginPath();
    ctx.arc(-radius * 0.33, -radius * 0.38, radius * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function renderProjectileLine(ctx, x, top, bottom) {
    ctx.save();
    ctx.strokeStyle = "#f8fbff";
    ctx.lineWidth = 3;
    ctx.shadowColor = "rgba(255, 255, 255, 0.8)";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(x, bottom);
    ctx.lineTo(x, top);
    ctx.stroke();
    ctx.strokeStyle = "#ff5bc8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 9, top + 10);
    ctx.lineTo(x, top);
    ctx.lineTo(x + 9, top + 10);
    ctx.stroke();
    ctx.restore();
  }

  function renderPowerUpVisual(ctx, powerUp) {
    const width = powerUp.width || 30;
    const height = powerUp.height || 24;
    ctx.save();
    ctx.translate(powerUp.x, powerUp.y);
    const isHeart = powerUp.type === POWERUP_HEART;
    ctx.shadowColor = isHeart ? "rgba(255, 120, 138, 0.72)" : "rgba(255, 209, 102, 0.72)";
    ctx.shadowBlur = 18;
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, isHeart ? "#ffd1dc" : "#fff4a8");
    gradient.addColorStop(1, isHeart ? "#ff4f78" : "#ff9f43");
    ctx.fillStyle = gradient;
    roundRect(ctx, 0, 0, width, height, 7);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.78)";
    ctx.lineWidth = 2;
    ctx.stroke();
    if (isHeart) {
      ctx.fillStyle = "#fff4f7";
      ctx.beginPath();
      ctx.moveTo(width * 0.5, height * 0.75);
      ctx.bezierCurveTo(width * 0.15, height * 0.5, width * 0.18, height * 0.17, width * 0.38, height * 0.24);
      ctx.bezierCurveTo(width * 0.46, height * 0.27, width * 0.5, height * 0.36, width * 0.5, height * 0.36);
      ctx.bezierCurveTo(width * 0.5, height * 0.36, width * 0.54, height * 0.27, width * 0.62, height * 0.24);
      ctx.bezierCurveTo(width * 0.82, height * 0.17, width * 0.85, height * 0.5, width * 0.5, height * 0.75);
      ctx.fill();
    } else {
      ctx.fillStyle = "#07111f";
      roundRect(ctx, width * 0.32, 5, 4, height - 10, 2);
      ctx.fill();
      roundRect(ctx, width * 0.58, 5, 4, height - 10, 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function renderPlayerShape(ctx, player, options) {
    if (typeof BubbleBangSprites !== "undefined" && BubbleBangSprites.renderPlayerSprite) {
      BubbleBangSprites.renderPlayerSprite(ctx, player, options);
      return;
    }

    const blink =
      resolvePlayerInvulnSeconds(player) > 0 && Math.floor(performance.now() / 70) % 2 === 0;
    if (blink) return;
    const primary = options.primary;
    const accent = options.accent;
    const width = player.width || 46;
    const height = player.height || 58;

    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.shadowColor = `${primary}88`;
    ctx.shadowBlur = 18;
    ctx.fillStyle = "#101a2a";
    ctx.strokeStyle = primary;
    ctx.lineWidth = 3;
    roundRect(ctx, 5, 16, width - 10, height - 16, 15);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#f4fbff";
    roundRect(ctx, 13, 3, width - 26, 24, 11);
    ctx.fill();
    ctx.strokeStyle = "#081427";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = accent;
    ctx.fillRect(width * 0.5 - 4, 7, 8, 4);
    ctx.restore();

    if (options.showName && player.nickname) {
      ctx.save();
      ctx.font = "700 13px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.lineWidth = 4;
      const textX = player.x + width * 0.5;
      const textY = player.y - 8;
      ctx.strokeText(player.nickname, textX, textY);
      ctx.fillText(player.nickname, textX, textY);
      ctx.restore();
    }
  }

  function resolvePlayerInvulnSeconds(player) {
    if (typeof player.invulnerableTime === "number" && player.invulnerableTime > 0) {
      return player.invulnerableTime;
    }
    if (typeof player.invulnerable === "number" && player.invulnerable > 0) {
      return player.invulnerable;
    }
    if (player.invulnerable === true) {
      return 1.5;
    }
    return 0;
  }

  function roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width * 0.5, height * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  window.addEventListener("load", () => {
    new Game();
  });
})();
