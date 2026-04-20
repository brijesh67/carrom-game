'use strict';

// ─── Physics Engine ──────────────────────────────────────────────────────────
// Operates on plain piece objects: { x, y, vx, vy, r, mass, pocketed }

const Physics = (() => {

  // Check if piece centre is near a corner pocket (exempt from wall bounce)
  function nearPocket(piece) {
    for (const p of CFG.POCKETS) {
      const dx = piece.x - p.x, dy = piece.y - p.y;
      if (dx*dx + dy*dy < (CFG.PD + piece.r) ** 2) return true;
    }
    return false;
  }

  function applyFriction(piece, dt) {
    const spd = Math.sqrt(piece.vx**2 + piece.vy**2);
    if (spd <= CFG.MIN_SPEED) { piece.vx = 0; piece.vy = 0; return; }
    const newSpd = Math.max(0, spd - CFG.FRICTION * dt);
    const factor = newSpd / spd;
    piece.vx *= factor;
    piece.vy *= factor;
  }

  function wallBounce(piece) {
    const { BX, BY, B2X, B2Y, WALL_REST: e } = CFG;
    const r = piece.r;
    if (nearPocket(piece)) return; // corner pockets handle these
    if (piece.x - r < BX)  { piece.vx =  Math.abs(piece.vx) * e; piece.x = BX + r; }
    if (piece.x + r > B2X) { piece.vx = -Math.abs(piece.vx) * e; piece.x = B2X - r; }
    if (piece.y - r < BY)  { piece.vy =  Math.abs(piece.vy) * e; piece.y = BY + r; }
    if (piece.y + r > B2Y) { piece.vy = -Math.abs(piece.vy) * e; piece.y = B2Y - r; }
  }

  // Impulse-based elastic collision between two circles
  function resolveCirclePair(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const distSq = dx*dx + dy*dy;
    const minDist = a.r + b.r;
    if (distSq >= minDist * minDist || distSq === 0) return false;

    const dist = Math.sqrt(distSq);
    const nx = dx / dist, ny = dy / dist;

    // Relative velocity along normal
    const dvx = b.vx - a.vx, dvy = b.vy - a.vy;
    const dvn = dvx*nx + dvy*ny;
    if (dvn >= 0) {
      // Already separating — just push apart
      const overlap = (minDist - dist) * 0.5;
      const ma = a.mass, mb = b.mass, tot = ma + mb;
      a.x -= nx * overlap * (mb / tot);
      a.y -= ny * overlap * (mb / tot);
      b.x += nx * overlap * (ma / tot);
      b.y += ny * overlap * (ma / tot);
      return false;
    }

    const e = CFG.RESTITUTION;
    const ma = a.mass, mb = b.mass;
    const j = -(1 + e) * dvn / (1/ma + 1/mb);

    a.vx -= j * nx / ma;
    a.vy -= j * ny / ma;
    b.vx += j * nx / mb;
    b.vy += j * ny / mb;

    // Positional correction to prevent sinking
    const overlap = (minDist - dist) * 0.5;
    const tot = ma + mb;
    a.x -= nx * overlap * (mb / tot);
    a.y -= ny * overlap * (mb / tot);
    b.x += nx * overlap * (ma / tot);
    b.y += ny * overlap * (ma / tot);
    return true; // collision occurred
  }

  // Detect which pieces entered a pocket this frame
  function detectPockets(pieces) {
    const pocketed = [];
    for (const piece of pieces) {
      if (piece.pocketed) continue;
      for (const p of CFG.POCKETS) {
        const dx = piece.x - p.x, dy = piece.y - p.y;
        if (dx*dx + dy*dy < CFG.PD * CFG.PD) {
          piece.pocketed = true;
          piece.vx = 0; piece.vy = 0;
          pocketed.push(piece);
          break;
        }
      }
    }
    return pocketed;
  }

  // Returns true when all pieces have stopped
  function allStopped(pieces) {
    return pieces.every(p => p.pocketed || (p.vx * p.vx + p.vy * p.vy < 0.25));
  }

  // Main step: integrate positions, apply friction/walls, resolve collisions
  // onCollision(a,b) callback fired on first-time hits for sound
  function step(pieces, dt, onCollision) {
    const active = pieces.filter(p => !p.pocketed);

    // Integrate
    for (const p of active) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    // Friction
    for (const p of active) applyFriction(p, dt);

    // Wall bounce
    for (const p of active) wallBounce(p);

    // Collision resolution (multiple iterations for stability)
    for (let iter = 0; iter < CFG.PHYS_ITER; iter++) {
      for (let i = 0; i < active.length; i++) {
        for (let k = i + 1; k < active.length; k++) {
          const hit = resolveCirclePair(active[i], active[k]);
          if (hit && iter === 0 && onCollision) onCollision(active[i], active[k]);
        }
      }
    }

    return detectPockets(active);
  }

  // Predict first-contact point along aim direction (for aim guide)
  function castRay(sx, sy, dirX, dirY, pieces) {
    let bestT = 900, hitX = sx + dirX*900, hitY = sy + dirY*900;
    for (const p of pieces) {
      if (p.pocketed || p.type === 'striker') continue;
      // Ray-circle intersection
      const fx = sx - p.x, fy = sy - p.y;
      const a = dirX*dirX + dirY*dirY;
      const b = 2*(fx*dirX + fy*dirY);
      const minD = CFG.SR + p.r;
      const c = fx*fx + fy*fy - minD*minD;
      const disc = b*b - 4*a*c;
      if (disc < 0) continue;
      const t = (-b - Math.sqrt(disc)) / (2*a);
      if (t > 2 && t < bestT) { bestT = t; hitX = sx+dirX*t; hitY = sy+dirY*t; }
    }
    return { x: hitX, y: hitY, hit: bestT < 900 };
  }

  return { step, allStopped, castRay };
})();
