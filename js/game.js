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

    // Hover preview: striker follows mouse before clicking
    this.previewX = CFG.CX;

    // Aggregated per-shot results
    this._turnResult = { ownCoinPocketed: 0, strikerPocketed: false, queenPocketedNow: false };
    this._strikerHitSomething = false;

    // Game-over click handler registered once
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

    // Inner ring: 6 coins, alternating W/B, starting white at top
    const iAngles = [270, 330, 30, 90, 150, 210].map(d => d * Math.PI / 180);
    const iColors = ['white','black','white','black','white','black'];
    iAngles.forEach((a, i) => coins.push(
      this._coin(CX + Math.cos(a)*INNER_R, CY + Math.sin(a)*INNER_R, iColors[i], `ic${i}`)
    ));

    // Outer ring: 12 coins, alternating B/W, starting black at top
    const oAngles = Array.from({length:12}, (_,i) => (270 + i*30) * Math.PI / 180);
    oAngles.forEach((a, i) => coins.push(
      this._coin(CX + Math.cos(a)*OUTER_R, CY + Math.sin(a)*OUTER_R, i%2===0?'black':'white', `oc${i}`)
    ));

    return coins;
  }

  _coin(x, y, type, id) {
    return { x, y, vx:0, vy:0, r: CFG.CR, mass: 1, type, id, pocketed: false };
  }

  _newStriker(player) {
    const bly = player === 0 ? CFG.BL1_Y : CFG.BL2_Y;
    return { x: CFG.CX, y: bly, vx:0, vy:0, r: CFG.SR, mass: 1.6, type:'striker', id:'striker', pocketed:false };
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

  // ─── Phase: MENU / GAME_OVER ──────────────────────────────────────────────
  _tickMenu() {
    if (this.input.consumeRelease()) {
      if (this.rules.phase === 'MENU') {
        this._startRound(true);
      }
      // GAME_OVER handled by click listener in _render
    }
  }

  // ─── Phase: PLACING ───────────────────────────────────────────────────────
  // Striker follows mouse X along baseline. Mousedown → go to AIMING.
  _tickPlacing() {
    const { BL_X1, BL_X2, SR } = CFG;
    const r = this.rules;

    // Preview: update striker x from mouse hover
    const clampX = Math.max(BL_X1 + SR, Math.min(BL_X2 - SR, this.input.currX));
    if (this.striker) this.striker.x = clampX;
    this.previewX = clampX;

    // Mousedown on baseline → start aiming
    if (this.input.isDown && this.input.clickedBaseline(r.currentPlayer)) {
      // Snap striker to click x
      if (this.striker) this.striker.x = this.input.strikerX();
      r.phase = 'AIMING';
    }

    this.input.consumeRelease(); // discard stray releases
  }

  // ─── Phase: AIMING ────────────────────────────────────────────────────────
  // Player holds mouse and drags to pull back; release fires the shot.
  _tickAiming() {
    const r = this.rules;

    // Release detected → shoot
    if (this.input.consumeRelease()) {
      const pull  = this.input.pullVec(this.striker);
      const power = (pull.len() / CFG.MAX_PULL) * CFG.MAX_POWER;

      if (power >= CFG.MIN_POWER) {
        const dir = pull.norm().neg(); // opposite pull = shot direction
        this.striker.vx = dir.x * power;
        this.striker.vy = dir.y * power;
        this.striker.pocketed = false;
        this._turnResult = { ownCoinPocketed: 0, strikerPocketed: false, queenPocketedNow: false };
        this._strikerHitSomething = false;
        r.phase = 'SHOOTING';
        Sound.shoot();
      } else {
        // Too little power — go back to placing
        r.phase = 'PLACING';
      }
      return;
    }

    // If mouse was lifted between frames without consumeRelease catching it
    if (!this.input.isDown && !this.input.justReleased) {
      r.phase = 'PLACING';
    }
  }

  // ─── Phase: SHOOTING ──────────────────────────────────────────────────────
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
        this._turnResult.ownCoinPocketed  += partial.ownCoinPocketed;
        this._turnResult.strikerPocketed   = this._turnResult.strikerPocketed || partial.strikerPocketed;
        this._turnResult.queenPocketedNow  = this._turnResult.queenPocketedNow || partial.queenPocketedNow;
      }
      this.accumulator -= CFG.PHYS_DT;
      if (Physics.allStopped(allPieces)) break;
    }

    if (Physics.allStopped(allPieces)) this._endTurn();
  }

  // ─── End of turn ──────────────────────────────────────────────────────────
  _endTurn() {
    const r = this.rules;

    // Foul: striker didn't touch any coin (scratch / missed shot)
    if (!this._strikerHitSomething && !this._turnResult.strikerPocketed) {
      r.setMessage('Foul! Striker missed all coins', '#ff4444', 2.5);
      Sound.foul();
      r._switchPlayer();
      this._prepareStriker();
      r.phase = 'PLACING';
      return;
    }

    r.resolveTurn(this._turnResult, this.queen);

    if (r.phase === 'GAME_OVER') {
      this._attachGameOverListener();
      return;
    }

    this._prepareStriker();
    r.phase = 'PLACING';
  }

  _prepareStriker() {
    const p = this.rules.currentPlayer;
    this.striker = this._newStriker(p);
    this.input.justReleased = false;
  }

  _startRound(resetScores) {
    this.pieces  = this._createCoins();
    if (resetScores) this.rules.reset();
    this.rules.startRound();
    this.striker = this._newStriker(this.rules.currentPlayer);
    this.input.justReleased = false;
  }

  // ─── Game-over button listener ────────────────────────────────────────────
  _attachGameOverListener() {
    if (this._goListener) this.canvas.removeEventListener('click', this._goListener);
    this._goListener = (e) => {
      if (this.rules.phase !== 'GAME_OVER') return;
      const rect = this.canvas.getBoundingClientRect();
      const sy   = (e.clientY - rect.top) * (CFG.SIZE / rect.height);
      if (sy > 392 && sy < 442) {
        // New round (keep scores)
        this.canvas.removeEventListener('click', this._goListener);
        this._goListener = null;
        this._startRound(false);
      } else if (sy > 452 && sy < 502) {
        // Full reset
        this.canvas.removeEventListener('click', this._goListener);
        this._goListener = null;
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

    // Baseline highlight when player is choosing placement
    if (r.phase === 'PLACING' || r.phase === 'AIMING') {
      Renderer.drawBaselineHighlight(ctx, r.currentPlayer);
    }

    // All coins
    for (const p of this.pieces) Renderer.drawPiece(ctx, p);

    // Striker
    if (this.striker && !this.striker.pocketed) {
      Renderer.drawPiece(ctx, this.striker);
    }

    // Aim guide: shown while mouse is held down in PLACING or AIMING
    if ((r.phase === 'PLACING' || r.phase === 'AIMING') &&
        this.input.isDown && this.striker && !this.striker.pocketed) {
      const pull  = this.input.pullVec(this.striker);
      const power = (pull.len() / CFG.MAX_PULL) * CFG.MAX_POWER;
      if (pull.len() > 6) {
        const dir = pull.norm().neg();
        const ray = Physics.castRay(
          this.striker.x, this.striker.y, dir.x, dir.y,
          this.pieces.filter(p => !p.pocketed)
        );
        Renderer.drawAimGuide(ctx, this.striker, pull, power, ray);
        Renderer.drawPowerBar(ctx, power, this.striker);
      }
    }

    // HUD
    Renderer.drawHUD(ctx, r.phaseLabel(), r.scores, r.pocketed, r.currentPlayer);

    // Status message
    if (r.message) Renderer.drawMessage(ctx, r.message, r.messageColor);

    // ── Full-screen overlays ────────────────────────────────────────────────
    if (r.phase === 'MENU') {
      const blink = Math.floor(this.blinkT * 1.8) % 2 === 0;
      Renderer.drawOverlay(ctx, [
        { text: 'CARROM',       font: 'bold 64px monospace', color: '#d4a020', y: 230 },
        { text: 'Board  Game',  font: '22px monospace',      color: '#b08020', y: 272 },
        { text: '─────────────────────────────',
          font: '13px monospace', color: '#444', y: 308 },
        { text: '↔  Move mouse over baseline to position striker',
          font: '13px monospace', color: '#999', y: 336 },
        { text: '⬇  Click & drag backward to aim',
          font: '13px monospace', color: '#999', y: 358 },
        { text: '↑  Release to fire',
          font: '13px monospace', color: '#999', y: 380 },
        { text: 'P1 = BLACK  ·  P2 = WHITE  ·  Queen needs cover',
          font: '12px monospace', color: '#666', y: 408 },
        { text: blink ? '▶  CLICK TO START' : '',
          font: 'bold 18px monospace', color: '#d4a020', y: 472 },
      ]);
    }

    if (r.phase === 'GAME_OVER') {
      const wn = `P${r.winner + 1}`;
      const wc = r.winner === 0 ? '#4499ff' : '#ff6644';
      Renderer.drawOverlay(ctx, [
        { text: `${wn} WINS!`,
          font: 'bold 58px monospace', color: wc, y: 240 },
        { text: `P1: ${r.scores[0]}  pts  ·  P2: ${r.scores[1]} pts`,
          font: '20px monospace', color: '#ccc', y: 290 },
        { text: 'Queen: ' + (r.queenCovered ? '✓ Covered (+3)' : '✗ Not covered'),
          font: '15px monospace', color: r.queenCovered ? '#ffcc00' : '#777', y: 318 },
        { text: '─────────────────────────────',
          font: '13px monospace', color: '#444', y: 358 },
      ], [
        { text: 'NEW ROUND  (keep scores)', y: 417, color: 'rgba(80,180,80,0.18)' },
        { text: 'RESET ALL',                y: 477, color: 'rgba(200,60,60,0.18)'  },
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
