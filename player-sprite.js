(function (global) {
  "use strict";

  /**
   * Sequenze da assets/player/ (copiate da Desktop/png, nomi senza spazi).
   * run = camminata, slide = sparo (nessun frame “shoot” nella cartella),
   * jump = vittoria, dead = game over.
   */
  const ATLAS = {
    idle: { prefix: "idle", frames: 10, fps: 7 },
    run: { prefix: "run", frames: 8, fps: 11 },
    slide: { prefix: "slide", frames: 5, fps: 12 },
    hurt: { prefix: "hurt", frames: 8, fps: 14 },
    dead: { prefix: "dead", frames: 10, fps: 9 },
    jump: { prefix: "jump", frames: 12, fps: 10 },
  };

  let pool = null;
  let loadCallbacks = [];

  function pathFor(prefix, index1) {
    return `assets/player/${prefix}-${String(index1).padStart(2, "0")}.png`;
  }

  function fireLoadCallbacks() {
    const cbs = loadCallbacks.slice();
    loadCallbacks = [];
    for (const cb of cbs) {
      try {
        cb();
      } catch (e) {
        console.error(e);
      }
    }
  }

  function tryComplete() {
    if (!pool || pool.loaded < pool.total) return;
    pool.ready = pool.loadErrors === 0;
    if (!pool.ready) {
      console.warn("Player sprite load incomplete; using vector fallback.");
    }
    fireLoadCallbacks();
  }

  function loadSpriteSheet() {
    if (pool) return pool;
    pool = {
      ready: false,
      failed: false,
      byTag: {},
      total: 0,
      loaded: 0,
      loadErrors: 0,
    };

    const tasks = [];
    for (const [tag, spec] of Object.entries(ATLAS)) {
      pool.byTag[tag] = new Array(spec.frames);
      for (let i = 1; i <= spec.frames; i += 1) {
        tasks.push({ tag, index: i - 1, path: pathFor(spec.prefix, i) });
      }
    }
    pool.total = tasks.length;

    for (const t of tasks) {
      const img = new Image();
      img.onload = () => {
        pool.byTag[t.tag][t.index] = img;
        pool.loaded += 1;
        tryComplete();
      };
      img.onerror = () => {
        console.warn("Sprite failed to load:", t.path);
        pool.loadErrors += 1;
        pool.loaded += 1;
        tryComplete();
      };
      img.src = t.path;
    }

    return pool;
  }

  function onSpriteSheetReady(callback) {
    loadSpriteSheet();
    if (pool.ready || (pool.loaded >= pool.total && pool.loadErrors > 0)) {
      callback();
      return;
    }
    loadCallbacks.push(callback);
  }

  function frameIndex(tag, timeSec) {
    const spec = ATLAS[tag];
    const n = spec.frames;
    const i = Math.floor(timeSec * spec.fps) % n;
    return Math.min(Math.max(0, i), n - 1);
  }

  function resolveInvulnSeconds(player) {
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

  function pickAnim(options) {
    const now = performance.now() / 1000;
    if (options.pose === "victory") {
      return { tag: "jump", frame: frameIndex("jump", now) };
    }
    if (options.pose === "defeat") {
      return { tag: "dead", frame: frameIndex("dead", now) };
    }
    if (options.invulnerable > 1.25) {
      return { tag: "hurt", frame: frameIndex("hurt", now) };
    }
    if (options.hasProjectile) {
      return { tag: "slide", frame: frameIndex("slide", now) };
    }
    if (options.isWalking) {
      return { tag: "run", frame: frameIndex("run", now) };
    }
    return { tag: "idle", frame: frameIndex("idle", now) };
  }

  function drawFrame(ctx, anim, destX, destY, destW, destH, facing) {
    const imgs = pool.byTag[anim.tag];
    const img = imgs && imgs[anim.frame];
    if (!img || !img.complete || !img.naturalWidth) {
      return false;
    }
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.translate(destX + destW * 0.5, destY);
    if (facing === "left") {
      ctx.scale(-1, 1);
    }
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, -destW * 0.5, 0, destW, destH);
    ctx.restore();
    return true;
  }

  function drawNickname(ctx, player, width) {
    if (!player.nickname) return;
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

  function drawFallbackBody(ctx, player, options) {
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
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} player x,y,width,height, invulnerable (seconds), nickname
   * @param {object} options primary, accent, showName, facing, isWalking, hasProjectile, pose
   */
  function renderPlayerSprite(ctx, player, options) {
    const width = player.width || 46;
    const height = player.height || 58;
    const invulnSec = resolveInvulnSeconds(player);
    const blink = invulnSec > 0 && Math.floor(performance.now() / 70) % 2 === 0;
    if (blink) return;

    const facing = options.facing || player.facing || "right";
    const anim = pickAnim({
      pose: options.pose || null,
      invulnerable: invulnSec,
      hasProjectile: Boolean(options.hasProjectile),
      isWalking: Boolean(options.isWalking),
    });

    loadSpriteSheet();
    const ok = pool.ready && drawFrame(ctx, anim, player.x, player.y, width, height, facing);
    if (!ok) {
      drawFallbackBody(ctx, player, options);
    }

    if (options.showName) {
      drawNickname(ctx, player, width);
    }
  }

  global.BubbleBangSprites = {
    loadSpriteSheet,
    onSpriteSheetReady,
    renderPlayerSprite,
    get isReady() {
      return Boolean(pool && pool.ready);
    },
  };
})(window);
