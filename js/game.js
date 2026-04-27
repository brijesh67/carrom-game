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
    this._anchorX = 0;
    this._anchorY = 0;
    this._pulling = false;

    // Per-shot result accumulator
    this._turnResult = { ownCoinPocketed: 0, strikerPocketed: false, queenPocketedNow: false };
    this._strikerHitSomething = false;

    // Multiplayer state
    this._net        = null;   // Network instance (null = local)
    this._myPlayer   = -1;     // 0 or 1; -1 = local 2-player
    this._opponentX  = null;   // opponent striker X during their PLACING phase
    this._placeTimer = 0;      // throttle for sending placing updates

    this._goListener = null;
    this._loop = this._loop.bind(this);

    // Pause the loop when the tab/app is hidden (phone call, app switch).
    // On resume, reset lastTs so dt starts fresh and physics doesn't jump.
    this._paused = false;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this._paused = true;
      } else if (this._paused) {
        this._paused = false;
        this.lastTs = 0;
        requestAnimationFrame(this._loop);
      }
    });

    requestAnimationFrame(this._loop);
  }

  // ─── Start modes ──────────────────────────────────────────────────────────
  startLocal() {
    this._net      = null;
    this._myPlayer = -1;
    this._startRound(true);
  }

  startMultiplayer(net, myPlayer) {
    this._net      = net;
    this._myPlayer = myPlayer;

    net.on('shot',     msg => { this._opponentX = null; this._applyRemoteShot(msg); });
    net.on('placing',  msg => { this._opponentX = msg.x; });
    net.on('new_round', msg => this._startRound(msg.resetScores));

    const onDisconnect = (msg) => {
      this.rules.phase = 'MENU';
      this.rules.setMessage(msg, '#ff4444', 99);
    };
    net.on('opponent_disconnected', () => onDisconnect('Opponent disconnected — return to lobby'));
    net.on('disconnect',            () => onDisconnect('Connection lost — please refresh'));

    // Brief interruptions (phone call, app switch): show banner instead of
    // ending the game. Server holds the room open for a 30s grace window.
    net.on('reconnecting',          () => this.rules.setMessage('Reconnecting…', '#ffaa44', 99));
    net.on('reconnected',           () => this.rules.setMessage('Connected', '#88ff88', 1.5));
    net.on('opponent_reconnecting', () => this.rules.setMessage('Opponent reconnecting…', '#ffaa44', 99));
    net.on('opponent_reconnected',  () => this.rules.setMessage('Opponent back', '#88ff88', 1.5));

    this._startRound(true);
  }

  // ─── Setup ────────────────────────────────────────────────────────────────
  init() {
    this.pieces  = this._createCoins();
    this.striker = null;
    this.rules.phase = 'MENU';
    // Loop already started in constructor
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

  _newStriker(player) {
    const y = (this._net && player === 1) ? CFG.BL2_Y : CFG.BL1_Y;
    return { x: CFG.CX, y, vx:0, vy:0, r: CFG.SR, mass:1.6,
             type:'striker', id:'striker', pocketed:false, player };
  }

  get queen() { return this.pieces.find(p => p.type === 'queen'); }

  // ─── Main loop ────────────────────────────────────────────────────────────
  _loop(ts) {
    if (this._paused) return;
    if (this.lastTs === 0) this.lastTs = ts;
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
    // In multiplayer, only show the canvas MENU overlay — clicks handled by lobby HTML
    if (this._net) { this.input.consumeRelease(); return; }
    if (this.input.consumeRelease() && this.rules.phase === 'MENU') {
      this._startRound(true);
    }
  }

  // ─── PLACING ──────────────────────────────────────────────────────────────
  _tickPlacing() {
    if (this._isRemoteTurn()) { this.input.consumeRelease(); return; }

    const r   = this.rules;
    const bly = (this._net && r.currentPlayer === 1) ? CFG.BL2_Y : CFG.BL1_Y;
    const inp = this._getInput();

    if (!this.input.isDown) {
      const hx = Math.max(CFG.BL_X1 + CFG.SR, Math.min(CFG.BL_X2 - CFG.SR, inp.currX));
      this.striker.x = hx;
      this.striker.y = bly;
    }

    if (this.input.isDown) {
      const sx = inp.startX, sy = inp.startY;
      const dx = sx - this.striker.x, dy = sy - this.striker.y;
      const distToStriker = Math.sqrt(dx*dx + dy*dy);

      if (distToStriker < CFG.SR * 2.8) {
        this._anchorX = this.striker.x;
        this._anchorY = this.striker.y;
        this._pulling = true;
        r.phase = 'AIMING';
      } else if (Math.abs(sy - bly) < 40 && sx >= CFG.BL_X1 && sx <= CFG.BL_X2) {
        this.striker.x = Math.max(CFG.BL_X1 + CFG.SR, Math.min(CFG.BL_X2 - CFG.SR, sx));
      }
    }

    // Stream striker position to opponent (~20fps)
    if (this._net && this.striker) {
      this._placeTimer++;
      if (this._placeTimer % 3 === 0) this._net.sendPlacing(this.striker.x);
    }

    this.input.consumeRelease();
  }

  // ─── AIMING ───────────────────────────────────────────────────────────────
  _tickAiming() {
    if (this._isRemoteTurn()) { this.input.consumeRelease(); return; }

    const r   = this.rules;
    const inp = this._getInput();

    const dx = inp.currX - this._anchorX;
    const dy = inp.currY - this._anchorY;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const clamped = Math.min(dist, CFG.MAX_PULL);

    if (dist > 0) {
      this.striker.x = this._anchorX + (dx / dist) * clamped;
      this.striker.y = this._anchorY + (dy / dist) * clamped;
    }

    if (this.input.consumeRelease()) {
      const pullDist = Math.min(dist, CFG.MAX_PULL);
      const power = (pullDist / CFG.MAX_PULL) * CFG.MAX_POWER;

      if (power >= CFG.MIN_POWER && dist > 0) {
        const dirX = (this._anchorX - this.striker.x) / pullDist;
        const dirY = (this._anchorY - this.striker.y) / pullDist;

        this.striker.x  = this._anchorX;
        this.striker.y  = this._anchorY;
        this.striker.vx = dirX * power;
        this.striker.vy = dirY * power;
        this.striker.pocketed = false;

        this._turnResult = { ownCoinPocketed:0, strikerPocketed:false, queenPocketedNow:false };
        this._strikerHitSomething = false;
        this.accumulator = 0;
        this._shotTimer  = 0;
        r.phase = 'SHOOTING';
        Sound.shoot();

        // Send shot to remote opponent
        if (this._net) {
          this._net.sendShot(this._anchorX, this._anchorY, this.striker.vx, this.striker.vy);
        }
      } else {
        this.striker.x = this._anchorX;
        this.striker.y = this._anchorY;
        r.phase = 'PLACING';
      }
      this._pulling = false;
      return;
    }

    if (!this.input.isDown && !this.input.justReleased) {
      this.striker.x = this._anchorX;
      this.striker.y = this._anchorY;
      this._pulling  = false;
      r.phase = 'PLACING';
    }
  }

  // ─── Apply a shot received from the remote player ─────────────────────────
  _applyRemoteShot({ anchorX, anchorY, vx, vy }) {
    this.striker = this._newStriker(this.rules.currentPlayer);
    this.striker.x  = anchorX;
    this.striker.y  = anchorY;
    this.striker.vx = vx;
    this.striker.vy = vy;
    this.striker.pocketed = false;

    this._anchorX = anchorX;
    this._anchorY = anchorY;
    this._turnResult = { ownCoinPocketed:0, strikerPocketed:false, queenPocketedNow:false };
    this._strikerHitSomething = false;
    this.accumulator = 0;
    this._shotTimer  = 0;
    this.rules.phase = 'SHOOTING';
    Sound.shoot();
  }

  // ─── SHOOTING ─────────────────────────────────────────────────────────────
  _tickShooting(dt) {
    this._shotTimer = (this._shotTimer || 0) + dt;
    if (this._shotTimer > 5) { this._shotTimer = 0; this._endTurn(); return; }
    this.accumulator += dt;
    const allPieces = [this.striker, ...this.pieces];

    const onCollision = (a, b) => {
      if (a === this.striker || b === this.striker) {
        this._strikerHitSomething = true;
        Sound.strikerHit();
      } else {
        Sound.hit();
      }
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

  // ─── Helpers ──────────────────────────────────────────────────────────────
  _isRemoteTurn() {
    return this._net !== null && this.rules.currentPlayer !== this._myPlayer;
  }

  // Returns mouse coords flipped 180° for P2 so their input matches the rotated canvas
  _getInput() {
    if (this._myPlayer === 1 && this._net) {
      return {
        currX:  CFG.SIZE - this.input.currX,
        currY:  CFG.SIZE - this.input.currY,
        startX: CFG.SIZE - this.input.startX,
        startY: CFG.SIZE - this.input.startY,
      };
    }
    return {
      currX:  this.input.currX,
      currY:  this.input.currY,
      startX: this.input.startX,
      startY: this.input.startY,
    };
  }

  // ─── Game-over listener ───────────────────────────────────────────────────
  _attachGameOverListener() {
    if (this._goListener) this.canvas.removeEventListener('click', this._goListener);
    this._goListener = (e) => {
      if (this.rules.phase !== 'GAME_OVER') return;
      const rect = this.canvas.getBoundingClientRect();
      const sy   = (e.clientY - rect.top) * (CFG.SIZE / rect.height);

      if (sy > 392 && sy < 442) {
        this.canvas.removeEventListener('click', this._goListener); this._goListener = null;
        if (this._net) this._net.sendNewRound(false);
        this._startRound(false);
      } else if (sy > 452 && sy < 502) {
        this.canvas.removeEventListener('click', this._goListener); this._goListener = null;
        if (this._net) this._net.sendNewRound(true);
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
    const p2flip = this._myPlayer === 1 && this._net;

    ctx.clearRect(0, 0, CFG.SIZE, CFG.SIZE);

    // Rotate canvas 180° for P2 so their baseline is at the bottom
    if (p2flip) { ctx.save(); ctx.translate(CFG.SIZE, CFG.SIZE); ctx.rotate(Math.PI); }

    Renderer.drawBoard(ctx);

    if (r.phase === 'PLACING' || r.phase === 'AIMING') {
      Renderer.drawBaselineHighlight(ctx, r.currentPlayer, !!this._net);
    }

    for (const p of this.pieces) Renderer.drawPiece(ctx, p);

    if (this.striker && !this.striker.pocketed) {
      Renderer.drawPiece(ctx, this.striker);
    }

    // Draw opponent ghost striker during their PLACING/AIMING turn
    if (this._net && this._opponentX !== null) {
      const oppPlayer = 1 - this._myPlayer;
      const oppY = oppPlayer === 1 ? CFG.BL2_Y : CFG.BL1_Y;
      ctx.save();
      ctx.globalAlpha = 0.38;
      Renderer.drawPiece(ctx, { x: this._opponentX, y: oppY, r: CFG.SR,
                                type: 'striker', player: oppPlayer, pocketed: false });
      ctx.restore();
    }

    let _aimPower = 0;
    if (r.phase === 'AIMING' && this.striker && !this.striker.pocketed) {
      const dx = this._anchorX - this.striker.x;
      const dy = this._anchorY - this.striker.y;
      const pullDist = Math.sqrt(dx*dx + dy*dy);
      // Dead zone: pull ≤ 6px counts as 0 power so the bar drops to 0 cleanly
      _aimPower = pullDist <= 6 ? 0 : (pullDist / CFG.MAX_PULL) * CFG.MAX_POWER;

      if (pullDist > 6) {
        const ndx = dx / pullDist, ndy = dy / pullDist;
        const ray = Physics.castRay(
          this._anchorX, this._anchorY, ndx, ndy,
          this.pieces.filter(p => !p.pocketed)
        );
        Renderer.drawAimGuide(ctx, this.striker, this._anchorX, this._anchorY, _aimPower, ray);
      }
    }

    if (r.queenNeedsCover) {
      ctx.save();
      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = '#ffaa00';
      ctx.textAlign = 'center';
      ctx.fillText('⚠ Cover the queen this shot!', CFG.CX, CFG.BY - 6);
      ctx.restore();
    }

    // Restore flip before drawing screen-space UI
    if (p2flip) ctx.restore();

    Renderer.drawHUD(ctx, r.phaseLabel(), r.scores, r.pocketed, r.currentPlayer);
    if (r.message) Renderer.drawMessage(ctx, r.message, r.messageColor);

    // Power bar always in screen space — shown at 0% in dead zone so player knows it's safe to release
    if (r.phase === 'AIMING') Renderer.drawPowerBar(ctx, _aimPower);

    // "Waiting for opponent" banner in multiplayer
    if (this._net && this._isRemoteTurn() &&
        (r.phase === 'PLACING' || r.phase === 'AIMING')) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, CFG.CY - 22, CFG.SIZE, 44);
      ctx.font = 'bold 18px monospace';
      ctx.fillStyle = '#ffcc44';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for opponent…', CFG.CX, CFG.CY + 7);
      ctx.restore();
    }

    if (r.phase === 'MENU') {
      const blink = Math.floor(this.blinkT * 1.8) % 2 === 0;
      Renderer.drawOverlay(ctx, [
        { text: 'CARROM',      font: 'bold 64px monospace', color: '#d4a020', y: 230 },
        { text: 'Board  Game', font: '22px monospace',      color: '#b08020', y: 272 },
        { text: '─────────────────────────────', font: '13px monospace', color: '#444', y: 308 },
        { text: '↔  Hover baseline to position striker',    font: '13px monospace', color: '#999', y: 336 },
        { text: '⬇  Click & drag striker backward to pull', font: '13px monospace', color: '#999', y: 358 },
        { text: '↑  Release to fire (more pull = more power)', font: '13px monospace', color: '#999', y: 380 },
        { text: 'P1 = WHITE  ·  P2 = BLACK  ·  Cover queen to keep it', font: '12px monospace', color: '#666', y: 408 },
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

// ─── Boot ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('carrom');
  canvas.width  = CFG.SIZE;
  canvas.height = CFG.SIZE;

  window.game = new Game(canvas);
  game.init();

  document.getElementById('soundBtn').addEventListener('click', () => {
    const on = Sound.toggle();
    document.getElementById('soundBtn').textContent = on ? '🔊' : '🔇';
  });
});
