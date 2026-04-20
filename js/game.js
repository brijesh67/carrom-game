'use strict';

class Game {
  constructor(canvas) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this.input   = new InputHandler(canvas);
    this.rules   = new Rules();
    this.pieces  = [];
    this.striker = null;
    this.accumulator = 0;
    this.lastTs  = 0;
    this.blinkT  = 0;

    // Pull-back mechanic state
    this._anchorX = 0;  // baseline resting position (shot fires from here)
    this._anchorY = 0;
    this._pulling = false; // true while player is dragging striker back

    // Per-shot result accumulator
    this._turnResult = { ownCoinPocketed: 0, strikerPocketed: false, queenPocketedNow: false };
    this._strikerHitSomething = false;

    this._goListener = null;
    this._loop = this._loop.bind(this);
  }

  // ─── Setup ────────────────────────────────────────────────────────────────
  init() {
    this.pieces  = this._createCoins();
    this.striker = null;
    this.rules.phase = 'MENU';
    requestAnimationFrame(this._loop);
  }

  _createCoins() {
    const { CX, CY, INNER_R, OUTER_R } = CFG;
    const coins = [];
    coins.push(this._coin(CX, CY, 'queen', 'q'));

    const iAngles = [270,330,30,90,150,210].map(d => d * Math.PI / 180);
    const iColors = ['white','black','white','black','white','black'];
    iAngles.forEach((a, i) => coins.push(
      this._coin(CX + Math.cos(a)*INNER_R, CY + Math.sin(a)*INNER_R, iColors[i], `ic${i}`)
    ));

    const oAngles = Array.from({length:12}, (_,i) => (270 + i*30) * Math.PI / 180);
    oAngles.forEach((a, i) => coins.push(
      this._coin(CX + Math.cos(a)*OUTER_R, CY + Math.sin(a)*OUTER_R, i%2===0?'black':'white', `oc${i}`)
    ));
    return coins;
  }

  _coin(x, y, type, id) {
    return { x, y, vx:0, vy:0, r: CFG.CR, mass:1, type, id, pocketed:false };
  }

  // Create striker at baseline center for the given player
  _newStriker(player) {
    const bly = player === 0 ? CFG.BL1_Y : CFG.BL2_Y;
    return { x: CFG.CX, y: bly, vx:0, vy:0, r: CFG.SR, mass:1.6, type:'striker', id:'striker', pocketed:false };
  }

  get queen() { return this.pieces.find(p => p.type === 'queen'); }

  // ─── Main loop ────────────────────────────────────────────────────────────
  _loop(ts) {
    const dt = Math.min((ts - this.lastTs) / 1000, 0.05);
    this.lastTs = ts;
    this.blinkT += dt;
    this.rules.tickMessage(dt);

    switch (this.rules.phase) {
      case 'MENU':
      case 'GAME_OVER': this._tickMenu(); break;
      case 'PLACING':   this._tickPlacing(); break;
      case 'AIMING':    this._tickAiming(); break;
      case 'SHOOTING':  this._tickShooting(dt); break;
    }

    this._render();
    requestAnimationFrame(this._loop);
  }

  // ─── MENU / GAME_OVER ─────────────────────────────────────────────────────
  _tickMenu() {
    if (this.input.consumeRelease() && this.rules.phase === 'MENU') {
      this._startRound(true);
    }
  }

  // ─── PLACING: striker follows mouse along baseline ─────────────────────────
  // Mousedown near striker → begin pull-back (AIMING phase)
  _tickPlacing() {
    const r   = this.rules;
    const bly = r.currentPlayer === 0 ? CFG.BL1_Y : CFG.BL2_Y;

    // Striker tracks mouse x along baseline (hover preview)
    if (!this.input.isDown) {
      const hx = Math.max(CFG.BL_X1 + CFG.SR, Math.min(CFG.BL_X2 - CFG.SR, this.input.currX));
      this.striker.x = hx;
      this.striker.y = bly;
    }

    if (this.input.isDown) {
      const sx = this.input.startX, sy = this.input.startY;
      const dx = sx - this.striker.x, dy = sy - this.striker.y;
      const distToStriker = Math.sqrt(dx*dx + dy*dy);

      if (distToStriker < CFG.SR * 2.8) {
        // Clicked near the striker — start pulling
        this._anchorX = this.striker.x;
        this._anchorY = this.striker.y;
        this._pulling = true;
        r.phase = 'AIMING';
      } else if (Math.abs(sy - bly) < 40 && sx >= CFG.BL_X1 && sx <= CFG.BL_X2) {
        // Clicked elsewhere on baseline → reposition striker
        this.striker.x = Math.max(CFG.BL_X1 + CFG.SR, Math.min(CFG.BL_X2 - CFG.SR, sx));
      }
    }

    this.input.consumeRelease();
  }

  // ─── AIMING: striker moves with mouse (clamped to MAX_PULL) ───────────────
  // Release fires the shot from anchor position.
  _tickAiming() {
    const r = this.rules;

    // Move striker to pulled-back position
    const dx = this.input.currX - this._anchorX;
    const dy = this.input.currY - this._anchorY;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const clamped = Math.min(dist, CFG.MAX_PULL);

    if (dist > 0) {
      this.striker.x = this._anchorX + (dx / dist) * clamped;
      this.striker.y = this._anchorY + (dy / dist) * clamped;
    }

    // Release → shoot
    if (this.input.consumeRelease()) {
      const pullDist = Math.min(dist, CFG.MAX_PULL);
      const power = (pullDist / CFG.MAX_PULL) * CFG.MAX_POWER;

      if (power >= CFG.MIN_POWER && dist > 0) {
        // Shot direction: from pulled pos toward anchor (slingshot forward)
        const dirX = (this._anchorX - this.striker.x) / pullDist;
        const dirY = (this._anchorY - this.striker.y) / pullDist;

        // Reset striker to anchor, apply velocity
        this.striker.x  = this._anchorX;
        this.striker.y  = this._anchorY;
        this.striker.vx = dirX * power;
        this.striker.vy = dirY * power;
        this.striker.pocketed = false;

        this._turnResult = { ownCoinPocketed:0, strikerPocketed:false, queenPocketedNow:false };
        this._strikerHitSomething = false;
        r.phase = 'SHOOTING';
        Sound.shoot();
      } else {
        // Not enough pull — snap striker back to anchor
        this.striker.x = this._anchorX;
        this.striker.y = this._anchorY;
        r.phase = 'PLACING';
      }
      this._pulling = false;
      return;
    }

    // Mouse lifted without consumeRelease (edge case) — cancel
    if (!this.input.isDown && !this.input.justReleased) {
      this.striker.x = this._anchorX;
      this.striker.y = this._anchorY;
      this._pulling  = false;
      r.phase = 'PLACING';
    }
  }

  // ─── SHOOTING ─────────────────────────────────────────────────────────────
  _tickShooting(dt) {
    this.accumulator += dt;
    const allPieces = [this.striker, ...this.pieces];

    const onCollision = (a, b) => {
      if (a === this.striker || b === this.striker) this._strikerHitSomething = true;
      Sound.hit();
    };

    while (this.accumulator >= CFG.PHYS_DT) {
      const newPocketed = Physics.step(allPieces, CFG.PHYS_DT, onCollision);
      if (newPocketed.length > 0) {
        const partial = this.rules.processPocketed(newPocketed, this.pieces);
        this._turnResult.ownCoinPocketed += partial.ownCoinPocketed;
        this._turnResult.strikerPocketed  = this._turnResult.strikerPocketed  || partial.strikerPocketed;
        this._turnResult.queenPocketedNow = this._turnResult.queenPocketedNow || partial.queenPocketedNow;
      }
      this.accumulator -= CFG.PHYS_DT;
      if (Physics.allStopped(allPieces)) break;
    }

    if (Physics.allStopped(allPieces)) this._endTurn();
  }

  // ─── End of turn ──────────────────────────────────────────────────────────
  _endTurn() {
    const r = this.rules;

    // Foul: striker never touched a coin
    if (!this._strikerHitSomething && !this._turnResult.strikerPocketed) {
      r.setMessage('Foul! Striker missed all coins', '#ff4444', 2.5);
      Sound.foul();
      r._switchPlayer();
      this._prepareStriker();
      r.phase = 'PLACING';
      return;
    }

    r.resolveTurn(this._turnResult, this.queen);

    if (r.phase === 'GAME_OVER') { this._attachGameOverListener(); return; }

    this._prepareStriker();
    r.phase = 'PLACING';
  }

  _prepareStriker() {
    this.striker = this._newStriker(this.rules.currentPlayer);
    this.input.justReleased = false;
  }

  _startRound(resetScores) {
    this.pieces  = this._createCoins();
    if (resetScores) this.rules.reset();
    this.rules.startRound();
    this.striker = this._newStriker(this.rules.currentPlayer);
    this.input.justReleased = false;
  }

  // ─── Game-over click listener ─────────────────────────────────────────────
  _attachGameOverListener() {
    if (this._goListener) this.canvas.removeEventListener('click', this._goListener);
    this._goListener = (e) => {
      if (this.rules.phase !== 'GAME_OVER') return;
      const rect = this.canvas.getBoundingClientRect();
      const sy   = (e.clientY - rect.top) * (CFG.SIZE / rect.height);
      if (sy > 392 && sy < 442) {
        this.canvas.removeEventListener('click', this._goListener); this._goListener = null;
        this._startRound(false);
      } else if (sy > 452 && sy < 502) {
        this.canvas.removeEventListener('click', this._goListener); this._goListener = null;
        this._startRound(true);
        this.rules.phase = 'MENU';
      }
    };
    this.canvas.addEventListener('click', this._goListener);
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  _render() {
    const ctx = this.ctx;
    const r   = this.rules;

    ctx.clearRect(0, 0, CFG.SIZE, CFG.SIZE);
    Renderer.drawBoard(ctx);

    if (r.phase === 'PLACING' || r.phase === 'AIMING') {
      Renderer.drawBaselineHighlight(ctx, r.currentPlayer);
    }

    // Coins
    for (const p of this.pieces) Renderer.drawPiece(ctx, p);

    // Striker (always draw — it moves during pull)
    if (this.striker && !this.striker.pocketed) {
      Renderer.drawPiece(ctx, this.striker);
    }

    // Aim guide during pull-back
    if (r.phase === 'AIMING' && this.striker && !this.striker.pocketed) {
      const dx = this._anchorX - this.striker.x;
      const dy = this._anchorY - this.striker.y;
      const pullDist = Math.sqrt(dx*dx + dy*dy);
      const power = (pullDist / CFG.MAX_PULL) * CFG.MAX_POWER;

      if (pullDist > 6) {
        const ndx = dx / pullDist, ndy = dy / pullDist;
        const ray = Physics.castRay(
          this._anchorX, this._anchorY, ndx, ndy,
          this.pieces.filter(p => !p.pocketed)
        );
        Renderer.drawAimGuide(ctx, this.striker, this._anchorX, this._anchorY, power, ray);
        Renderer.drawPowerBar(ctx, power, { x: this._anchorX, y: this._anchorY, r: CFG.SR });
      }
    }

    // HUD
    Renderer.drawHUD(ctx, r.phaseLabel(), r.scores, r.pocketed, r.currentPlayer);
    if (r.message) Renderer.drawMessage(ctx, r.message, r.messageColor);

    // ── Queen cover indicator ───────────────────────────────────────────────
    if (r.queenNeedsCover) {
      ctx.save();
      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = '#ffaa00';
      ctx.textAlign = 'center';
      ctx.fillText('⚠ Cover the queen this shot!', CFG.CX, CFG.BY - 6);
      ctx.restore();
    }

    // ── Overlays ────────────────────────────────────────────────────────────
    if (r.phase === 'MENU') {
      const blink = Math.floor(this.blinkT * 1.8) % 2 === 0;
      Renderer.drawOverlay(ctx, [
        { text: 'CARROM',      font: 'bold 64px monospace', color: '#d4a020', y: 230 },
        { text: 'Board  Game', font: '22px monospace',      color: '#b08020', y: 272 },
        { text: '─────────────────────────────', font: '13px monospace', color: '#444', y: 308 },
        { text: '↔  Hover baseline to position striker',   font: '13px monospace', color: '#999', y: 336 },
        { text: '⬇  Click & drag striker backward to pull', font: '13px monospace', color: '#999', y: 358 },
        { text: '↑  Release to fire (more pull = more power)', font: '13px monospace', color: '#999', y: 380 },
        { text: 'P1 = BLACK  ·  P2 = WHITE  ·  Cover queen to keep it', font: '12px monospace', color: '#666', y: 408 },
        { text: blink ? '▶  CLICK TO START' : '', font: 'bold 18px monospace', color: '#d4a020', y: 472 },
      ]);
    }

    if (r.phase === 'GAME_OVER') {
      const wc = r.winner === 0 ? '#4499ff' : '#ff6644';
      Renderer.drawOverlay(ctx, [
        { text: `P${r.winner+1} WINS!`, font: 'bold 58px monospace', color: wc, y: 240 },
        { text: `P1: ${r.scores[0]} pts  ·  P2: ${r.scores[1]} pts`, font: '20px monospace', color: '#ccc', y: 290 },
        { text: 'Queen: ' + (r.queenCovered ? '✓ Covered (+3)' : '✗ Not covered'), font: '15px monospace', color: r.queenCovered ? '#ffcc00' : '#777', y: 318 },
        { text: '─────────────────────────────', font: '13px monospace', color: '#444', y: 358 },
      ], [
        { text: 'NEW ROUND  (keep scores)', y: 417, color: 'rgba(80,180,80,0.18)' },
        { text: 'RESET ALL',               y: 477, color: 'rgba(200,60,60,0.18)'  },
      ]);
    }
  }
}

// ─── Boot ────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('carrom');
  canvas.width  = CFG.SIZE;
  canvas.height = CFG.SIZE;

  const game = new Game(canvas);
  game.init();

  document.getElementById('soundBtn').addEventListener('click', () => {
    const on = Sound.toggle();
    document.getElementById('soundBtn').textContent = on ? '🔊' : '🔇';
  });
});
