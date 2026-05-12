(function (global) {
  "use strict";

  const SHEET_PATH = "assets/pang1989-character-spritesheet.png";
  const COLS = 4;
  const ROWS = 6;
  /** Frames used per row (sheet layout from asset). */
  const ROW_FRAMES = [2, 4, 3, 2, 2, 2];

  const ROW = {
    idle: 0,
    walk: 1,
    shoot: 2,
    hurt: 3,
    defeat: 4,
    victory: 5,
  };

  let sheet = null;
  let loadCallbacks = [];

  function loadSpriteSheet() {
    if (sheet) return sheet;
    const image = new Image();
    sheet = { image, ready: false };
    image.onload = () => {
      sheet.ready = true;
      const cbs = loadCallbacks.slice();
      loadCallbacks = [];
      for (const cb of cbs) {
        try {
          cb();
        } catch (e) {
          console.error(e);
        }
      }
    };
    image.onerror = () => {
      console.warn("Player sprite sheet failed to load:", SHEET_PATH);
      sheet.failed = true;
      const cbs = loadCallbacks.slice();
      loadCallbacks = [];
      for (const cb of cbs) cb();
    };
    image.src = SHEET_PATH;
    return sheet;
  }

  function onSpriteSheetReady(callback) {
    loadSpriteSheet();
    if (sheet.ready || sheet.failed) {
      callback();
      return;
    }
    loadCallbacks.push(callback);
  }

  function cellSize(img) {
    return {
      w: img.naturalWidth / COLS,
      h: img.naturalHeight / ROWS,
    };
  }

  function frameIndex(row, timeSec, fps) {
    const count = ROW_FRAMES[row] || 1;
    const i = Math.floor(timeSec * fps) % count;
    return Math.min(i, count - 1);
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
      return { row: ROW.victory, col: frameIndex(ROW.victory, now, 3) };
    }
    if (options.pose === "defeat") {
      return { row: ROW.defeat, col: Math.min(ROW_FRAMES[ROW.defeat] - 1, Math.floor(now * 2) % ROW_FRAMES[ROW.defeat]) };
    }
    if (options.invulnerable > 1.25) {
      return { row: ROW.hurt, col: frameIndex(ROW.hurt, now, 6) };
    }
    if (options.hasProjectile) {
      return { row: ROW.shoot, col: frameIndex(ROW.shoot, now, 8) };
    }
    if (options.isWalking) {
      return { row: ROW.walk, col: frameIndex(ROW.walk, now, 10) };
    }
    return { row: ROW.idle, col: frameIndex(ROW.idle, now, 4) };
  }

  function drawSprite(ctx, img, anim, destX, destY, destW, destH, facing) {
    const { w: cw, h: ch } = cellSize(img);
    const col = Math.min(anim.col, ROW_FRAMES[anim.row] - 1);
    const sx = col * cw;
    const sy = anim.row * ch;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(destX + destW * 0.5, destY);
    if (facing === "left") {
      ctx.scale(-1, 1);
    }
    ctx.drawImage(img, sx, sy, cw, ch, -destW * 0.5, 0, destW, destH);
    ctx.restore();
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
    if (sheet.ready && sheet.image.naturalWidth) {
      drawSprite(ctx, sheet.image, anim, player.x, player.y, width, height, facing);
    } else {
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
      return Boolean(sheet && sheet.ready);
    },
  };
})(window);
