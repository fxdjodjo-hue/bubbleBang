(function () {
  "use strict";

  const WIDTH = 960;
  const HEIGHT = 540;
  const FLOOR_Y = HEIGHT - 58;
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
      bounce: 510,
    },
    medium: {
      radius: 30,
      next: "small",
      score: 200,
      color: "#ffd166",
      glow: "rgba(255, 209, 102, 0.5)",
      bounce: 455,
    },
    small: {
      radius: 21,
      next: "tiny",
      score: 400,
      color: "#77f3ff",
      glow: "rgba(119, 243, 255, 0.52)",
      bounce: 390,
    },
    tiny: {
      radius: 14,
      next: null,
      score: 800,
      color: "#8cff82",
      glow: "rgba(140, 255, 130, 0.48)",
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

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const rand = (min, max) => min + Math.random() * (max - min);

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

  class InputManager {
    constructor(game) {
      this.game = game;
      this.keys = new Set();
      this.touch = { left: false, right: false, shoot: false };
      this.pausePressed = false;
      this.confirmPressed = false;
      this.shootPressed = false;
      window.addEventListener("keydown", (event) => this.handleKeyDown(event));
      window.addEventListener("keyup", (event) => this.handleKeyUp(event));
      this.bindTouchButton("touch-left", "left");
      this.bindTouchButton("touch-right", "right");
      this.bindTouchButton("touch-shoot", "shoot");

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
      };
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        if (button.setPointerCapture) button.setPointerCapture(event.pointerId);
        setActive(true);
        if (action === "shoot") this.shootPressed = true;
      });
      button.addEventListener("pointerup", (event) => {
        event.preventDefault();
        setActive(false);
      });
      button.addEventListener("pointercancel", () => setActive(false));
      button.addEventListener("lostpointercapture", () => setActive(false));
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
      const left = this.keys.has("arrowleft") || this.keys.has("a") || this.touch.left;
      const right = this.keys.has("arrowright") || this.keys.has("d") || this.touch.right;
      const shoot = this.keys.has(" ") || this.keys.has("spacebar") || this.touch.shoot;
      const actions = {
        left,
        right,
        move: (right ? 1 : 0) - (left ? 1 : 0),
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
      this.resetForRun();
    }

    resetForRun() {
      this.lives = 3;
      this.resetPosition();
      this.invulnerable = 0;
      this.hitCooldown = 0;
    }

    resetPosition() {
      this.x = WIDTH * 0.5 - this.width * 0.5;
      this.y = FLOOR_Y - this.height;
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
      this.x += input.move * this.speed * dt;
      this.x = clamp(this.x, 14, WIDTH - this.width - 14);

      const playerRect = this.rect;
      for (const platform of platforms) {
        if (!rectOverlap(playerRect, platform)) continue;
        if (this.x > oldX) this.x = platform.x - this.width + 5;
        if (this.x < oldX) this.x = platform.x + platform.width - 5;
      }
    }

    takeHit() {
      if (this.invulnerable > 0 || this.hitCooldown > 0) return false;
      this.lives -= 1;
      this.invulnerable = 1.7;
      this.hitCooldown = 0.3;
      return true;
    }

    render(ctx) {
      renderPlayerShape(ctx, {
        id: "single-player",
        nickname: "",
        x: this.x,
        y: this.y,
        width: this.width,
        height: this.height,
        invulnerable: this.invulnerable > 0,
      }, { primary: "#77f3ff", accent: "#ff5bc8", showName: false });
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
        new Ball({ size: nextSize, x: leftX, y: spawnY, vx: -speed, vy: -nextType.bounce * 0.78 }),
        new Ball({ size: nextSize, x: rightX, y: spawnY, vx: speed, vy: -nextType.bounce * 0.78 }),
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
    }

    get url() {
      if (window.location.protocol === "file:") return "http://localhost:3001";
      const localHost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
      if (localHost && window.location.port && window.location.port !== "3001") {
        return "http://localhost:3001";
      }
      return window.location.origin;
    }

    ensureSocket() {
      if (!window.io) {
        this.game.setMultiplayerStatus("Socket.IO client not found. Run npm install, then npm run dev.");
        return false;
      }
      if (this.socket) return true;

      this.socket = window.io(this.url, {
        autoConnect: false,
        transports: ["websocket", "polling"],
      });

      this.socket.on("connect", () => {
        this.game.setMultiplayerStatus("Connected.");
        if (this.pendingConnectAction) {
          const action = this.pendingConnectAction;
          this.pendingConnectAction = null;
          action();
        }
      });

      this.socket.on("connect_error", () => {
        this.game.setMultiplayerStatus("Server unavailable. Start it with npm run dev.");
      });

      this.socket.on("disconnect", () => {
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
      };
      const encoded = JSON.stringify(payload);
      if (encoded === this.lastInputPayload) return;
      this.lastInputPayload = encoded;
      this.socket.emit("player_input", payload);
    }

    leaveRoom() {
      if (this.socket && this.socket.connected && this.roomCode) {
        this.socket.emit("leave_room");
      }
      this.playerId = null;
      this.roomCode = "";
      this.lastInputPayload = "";
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
        connectionStatus: document.getElementById("connection-status"),
        roomCodeDisplay: document.getElementById("room-code-display"),
        playerList: document.getElementById("player-list"),
        restartRoomButton: document.getElementById("restart-room-button"),
      };

      this.input = new InputManager(this);
      this.player = new Player();
      this.levelManager = new LevelManager();
      this.particles = new ParticleSystem();
      this.multiplayer = new SocketClient(this);
      this.balls = [];
      this.projectile = null;
      this.platforms = [];
      this.score = 0;
      this.levelClearBonus = 1500;
      this.shake = 0;
      this.lastTime = 0;
      this.state = STATE.MENU;
      this.mode = "single";
      this.multiplayerStatus = "";
      this.multiplayerSnapshot = null;
      this.waitingPlayers = [];
      this.lastInputSend = 0;
      this.ping = null;

      this.bindMenuButtons();
      window.addEventListener("resize", () => this.fitCanvas());
      window.addEventListener("orientationchange", () => this.fitCanvas());
      this.fitCanvas();
      this.updateOverlay();
      requestAnimationFrame((time) => this.loop(time));
    }

    bindMenuButtons() {
      document.getElementById("single-player-button").addEventListener("click", () => this.startNewRun());
      document.getElementById("multiplayer-button").addEventListener("click", () => this.showMultiplayerMenu());
      document.getElementById("back-menu-button").addEventListener("click", () => this.showMainMenu());
      document.getElementById("create-room-button").addEventListener("click", () => {
        this.setMultiplayerStatus("Connecting...");
        this.multiplayer.createRoom(this.ui.nicknameInput.value);
      });
      document.getElementById("join-room-button").addEventListener("click", () => {
        this.setMultiplayerStatus("Connecting...");
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
      this.render();
      requestAnimationFrame((nextTime) => this.loop(nextTime));
    }

    handleGlobalInput(actions) {
      if (actions.pause) {
        this.togglePause();
      }
      if (!actions.confirm) return;

      if (this.state === STATE.MENU) {
        this.startNewRun();
      } else if (this.state === STATE.GAME_OVER || this.state === STATE.DEMO_COMPLETE) {
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

    showMainMenu(message = "") {
      this.mode = "single";
      this.state = STATE.MENU;
      this.multiplayerStatus = message;
      this.multiplayerSnapshot = null;
      this.waitingPlayers = [];
      this.updateOverlay();
    }

    showMultiplayerMenu(message = "") {
      this.mode = "multiplayer";
      this.state = STATE.MULTIPLAYER_MENU;
      this.multiplayerStatus = message || "Create a room or join a friend's code.";
      this.multiplayerSnapshot = null;
      this.waitingPlayers = [];
      this.updateOverlay();
    }

    startNewRun() {
      this.mode = "single";
      this.score = 0;
      this.player.resetForRun();
      this.levelManager.reset();
      this.loadCurrentLevel();
      this.state = STATE.PLAYING;
      this.updateOverlay();
    }

    loadCurrentLevel() {
      const level = this.levelManager.current;
      this.player.resetPosition();
      this.player.invulnerable = 1.2;
      this.projectile = null;
      this.platforms = level.platforms.map((platform) => ({ ...platform }));
      this.balls = level.balls.map((ball) => new Ball(ball));
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

      if ((actions.shoot || actions.shootPressed) && !this.projectile) {
        this.projectile = new Projectile(this.player.shootX, this.player.y + 14);
        this.playSoundCue("shoot");
      }

      if (this.projectile) {
        this.projectile.update(dt, this.platforms);
        if (!this.projectile.active) this.projectile = null;
      }

      for (const ball of this.balls) {
        ball.update(dt, this.platforms);
      }

      this.handleProjectileCollisions();
      this.handlePlayerCollisions();
      this.checkLevelClear();
      this.updateHud();
    }

    updateMultiplayer(dt, actions) {
      this.lastInputSend += dt;
      if (this.state === STATE.MP_PLAYING && this.lastInputSend >= 0.05) {
        this.lastInputSend = 0;
        this.multiplayer.sendInput(actions);
      }
      this.updateHud();
    }

    handleProjectileCollisions() {
      if (!this.projectile) return;
      for (let i = this.balls.length - 1; i >= 0; i -= 1) {
        const ball = this.balls[i];
        if (!lineCircleOverlap(this.projectile.rect, ball)) continue;
        ball.hitFlash = 0.12;
        this.score += ball.type.score;
        this.particles.burst(ball.x, ball.y, ball.type.color, ball.size === "tiny" ? 16 : 24);
        this.shake = ball.size === "large" ? 8 : 5;
        this.playSoundCue("pop");
        const splitBalls = ball.split(this.player.rect);
        this.balls.splice(i, 1, ...splitBalls);
        this.projectile = null;
        return;
      }
    }

    handlePlayerCollisions() {
      const playerRect = this.player.rect;
      for (const ball of this.balls) {
        if (!circleRectOverlap(ball, playerRect)) continue;
        if (!this.player.takeHit()) return;
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
      this.score += this.levelClearBonus + this.levelManager.currentNumber * 250;
      this.projectile = null;
      this.state = STATE.LEVEL_COMPLETE;
      this.updateOverlay();
    }

    playSoundCue(name) {
      // Placeholder hook for future WebAudio clips.
      this.lastSoundCue = name;
    }

    handleRoomJoined(roomCode, message) {
      this.mode = "multiplayer";
      this.state = STATE.MP_WAITING;
      this.multiplayerStatus = message;
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
      this.multiplayerSnapshot = snapshot;
      this.ping = Math.max(0, Date.now() - snapshot.serverTime);
      this.processServerEvents(snapshot.events || []);

      if (snapshot.gameState === "waiting") this.state = STATE.MP_WAITING;
      if (snapshot.gameState === "countdown") this.state = STATE.MP_COUNTDOWN;
      if (snapshot.gameState === "playing") this.state = STATE.MP_PLAYING;
      if (snapshot.gameState === "levelComplete") this.state = STATE.MP_LEVEL_COMPLETE;
      if (snapshot.gameState === "gameOver") this.state = STATE.MP_GAME_OVER;
      this.updateOverlay();
    }

    processServerEvents(events) {
      for (const event of events) {
        if (event.type === "ball_hit") {
          const color = event.color || BALL_TYPES[event.size]?.color || "#77f3ff";
          this.particles.burst(event.x, event.y, color, event.size === "tiny" ? 16 : 24);
          this.shake = event.size === "large" ? 8 : 5;
        } else if (event.type === "player_hit") {
          this.particles.burst(event.x, event.y, "#f8fbff", 26);
          this.shake = 10;
        }
      }
    }

    handleMultiplayerDisconnect(message) {
      this.multiplayer.leaveRoom();
      this.mode = "single";
      this.state = STATE.MENU;
      this.multiplayerStatus = message;
      this.multiplayerSnapshot = null;
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
        this.hud.level.textContent = `Room ${snapshot.roomCode} - L${snapshot.level}`;
        this.hud.lives.textContent = `Team Lives ${Math.max(0, snapshot.teamLives)}`;
        this.hud.balls.textContent = `Balls ${snapshot.balls.length}`;
        this.hud.score.textContent = snapshot.score.toString().padStart(6, "0");
        this.hud.ping.textContent = this.ping === null ? "Ping --" : `Ping ${this.ping}ms`;
        return;
      }

      this.hud.level.textContent = `Level ${this.levelManager.currentNumber}`;
      this.hud.lives.textContent = `Lives ${Math.max(0, this.player.lives)}`;
      this.hud.balls.textContent = `Balls ${this.balls.length}`;
      this.hud.score.textContent = this.score.toString().padStart(6, "0");
      this.hud.ping.textContent = "Ping --";
    }

    updateOverlay() {
      let visible = true;
      let title = "Bubble Bang MVP";
      let subtitle = this.multiplayerStatus || "Choose a mode";
      let controls = "Move: A/D or Arrow Keys - Shoot: Space - Pause: Esc/P";
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
      this.projectile?.render(ctx);
      for (const ball of this.balls) {
        ball.render(ctx);
      }
      this.player.render(ctx);
    }

    renderMultiplayer(ctx) {
      const snapshot = this.multiplayerSnapshot;
      const platforms = snapshot?.platforms || [];
      const projectiles = snapshot?.projectiles || [];
      const balls = snapshot?.balls || [];
      const players = snapshot?.players || [];

      for (const platform of platforms) {
        this.renderPlatform(ctx, platform);
      }
      for (const projectile of projectiles) {
        renderProjectileLine(ctx, projectile.x, projectile.y, projectile.y + projectile.height);
      }
      for (const ball of balls) {
        renderBallVisual(ctx, ball, 0, 0);
      }
      for (const player of players) {
        const isLocal = player.id === this.multiplayer.playerId;
        renderPlayerShape(ctx, player, {
          primary: isLocal ? "#77f3ff" : "#ffd166",
          accent: isLocal ? "#ff5bc8" : "#8cff82",
          showName: true,
        });
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

  function renderPlayerShape(ctx, player, options) {
    const blink = player.invulnerable && Math.floor(performance.now() / 70) % 2 === 0;
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
