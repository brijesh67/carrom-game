'use strict';

class InputHandler {
  constructor(canvas) {
    this.canvas  = canvas;
    this.isDown  = false;
    this.startX  = 0; this.startY = 0;
    this.currX   = 0; this.currY  = 0;
    this.justReleased = false;
    this._bind();
  }

  _toCanvas(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const sx = CFG.SIZE / r.width;
    const sy = CFG.SIZE / r.height;
    return { x: (clientX - r.left) * sx, y: (clientY - r.top) * sy };
  }

  _bind() {
    const down = (cx, cy) => {
      const p = this._toCanvas(cx, cy);
      this.isDown = true;
      this.startX = p.x; this.startY = p.y;
      this.currX  = p.x; this.currY  = p.y;
      this.justReleased = false;
    };
    const move = (cx, cy) => {
      if (!this.isDown) return;
      const p = this._toCanvas(cx, cy);
      this.currX = p.x; this.currY = p.y;
    };
    const up = () => {
      if (!this.isDown) return;
      this.isDown = false;
      this.justReleased = true;
    };

    this.canvas.addEventListener('mousedown',  e => { if (e.button===0) down(e.clientX, e.clientY); });
    this.canvas.addEventListener('mousemove',  e => move(e.clientX, e.clientY));
    window.addEventListener      ('mouseup',   e => { if (e.button===0) up(); });

    // Touch
    this.canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      const t = e.touches[0];
      down(t.clientX, t.clientY);
    }, { passive: false });
    this.canvas.addEventListener('touchmove',  e => {
      e.preventDefault();
      const t = e.touches[0];
      move(t.clientX, t.clientY);
    }, { passive: false });
    this.canvas.addEventListener('touchend',   e => { e.preventDefault(); up(); }, { passive: false });
  }

  consumeRelease() {
    const v = this.justReleased;
    this.justReleased = false;
    return v;
  }

  // Returns the striker X clamped to the baseline zone
  strikerX() {
    return Math.max(CFG.BL_X1 + CFG.SR, Math.min(CFG.BL_X2 - CFG.SR, this.currX));
  }

  // Pull-back vector from striker to current mouse (for aiming)
  pullVec(striker) {
    const dx = striker.x - this.currX;
    const dy = striker.y - this.currY;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const clamped = Math.min(dist, CFG.MAX_PULL);
    if (dist < 1) return new Vec2(0, 0);
    return new Vec2(dx / dist * clamped, dy / dist * clamped);
  }

  // Power calculated from pull distance (px/s)
  power(striker) {
    const pv = this.pullVec(striker);
    return (pv.len() / CFG.MAX_PULL) * CFG.MAX_POWER;
  }

  // Whether the initial click was on the baseline zone for the given player
  clickedBaseline(player) {
    const bly = player === 0 ? CFG.BL1_Y : CFG.BL2_Y;
    const { startX: x, startY: y } = this;
    return Math.abs(y - bly) < 36 && x >= CFG.BL_X1 && x <= CFG.BL_X2;
  }
}
