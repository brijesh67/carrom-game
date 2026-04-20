'use strict';

const Renderer = (() => {
  const { COLORS: C, CX, CY, BX, BY, B2X, B2Y, BS, PR,
          BL1_Y, BL2_Y, BL_X1, BL_X2, POCKETS } = CFG;

  // ─── Board ──────────────────────────────────────────────────────────────
  function drawBoard(ctx) {
    // Outer frame
    ctx.fillStyle = C.FRAME;
    ctx.fillRect(0, 0, CFG.SIZE, CFG.SIZE);

    // Inner frame bevel
    ctx.fillStyle = C.FRAME_IN;
    const fp = 8;
    ctx.fillRect(fp, fp, CFG.SIZE - fp*2, CFG.SIZE - fp*2);

    // Playing surface
    const grad = ctx.createLinearGradient(BX, BY, BX + BS * 0.6, BY + BS);
    grad.addColorStop(0,   C.SURFACE);
    grad.addColorStop(0.5, C.SURFACE2);
    grad.addColorStop(1,   C.SURFACE);
    ctx.fillStyle = grad;
    ctx.fillRect(BX, BY, BS, BS);

    // Corner triangular cuts (frame over corners to create diagonal pocket guide)
    const DIAG = 54;
    ctx.fillStyle = C.FRAME_IN;
    const corners = [
      [BX, BY, BX+DIAG, BY, BX, BY+DIAG],
      [B2X, BY, B2X-DIAG, BY, B2X, BY+DIAG],
      [BX, B2Y, BX+DIAG, B2Y, BX, B2Y-DIAG],
      [B2X, B2Y, B2X-DIAG, B2Y, B2X, B2Y-DIAG],
    ];
    for (const [x0,y0,x1,y1,x2,y2] of corners) {
      ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y1); ctx.lineTo(x2,y2);
      ctx.closePath(); ctx.fill();
    }

    // Pocket holes
    for (const p of POCKETS) {
      // Outer shadow ring
      const pg = ctx.createRadialGradient(p.x, p.y, PR*0.3, p.x, p.y, PR+4);
      pg.addColorStop(0, '#000');
      pg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.arc(p.x, p.y, PR+4, 0, Math.PI*2); ctx.fill();
      // Hole
      ctx.fillStyle = C.POCKET;
      ctx.beginPath(); ctx.arc(p.x, p.y, PR, 0, Math.PI*2); ctx.fill();
      // Inner sheen
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, PR - 3, 0, Math.PI*2); ctx.stroke();
    }

    // Diagonal guide lines from pockets
    ctx.strokeStyle = C.LINE;
    ctx.lineWidth = 1.2;
    const guideLines = [
      [BX+DIAG, BY, BX, BY+DIAG],
      [B2X-DIAG, BY, B2X, BY+DIAG],
      [BX+DIAG, B2Y, BX, B2Y-DIAG],
      [B2X-DIAG, B2Y, B2X, B2Y-DIAG],
    ];
    for (const [x1,y1,x2,y2] of guideLines) {
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    }

    // Board outer boundary lines
    ctx.strokeStyle = C.LINE;
    ctx.lineWidth = 2;
    ctx.strokeRect(BX, BY, BS, BS);

    // Centre markings
    ctx.strokeStyle = C.LINE;
    ctx.lineWidth = 1.4;
    // Outer disc ring
    ctx.beginPath(); ctx.arc(CX, CY, 88, 0, Math.PI*2); ctx.stroke();
    // Inner disc ring
    ctx.beginPath(); ctx.arc(CX, CY, 44, 0, Math.PI*2); ctx.stroke();
    // Queen ring
    ctx.beginPath(); ctx.arc(CX, CY, 17, 0, Math.PI*2); ctx.stroke();
    // Cross lines
    const CL = 95;
    ctx.beginPath(); ctx.moveTo(CX-CL,CY); ctx.lineTo(CX+CL,CY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(CX,CY-CL); ctx.lineTo(CX,CY+CL); ctx.stroke();
    // 4 arrow dots on outer ring
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI/2 - Math.PI/4;
      ctx.fillStyle = C.LINE;
      ctx.beginPath();
      ctx.arc(CX + Math.cos(a)*88, CY + Math.sin(a)*88, 4, 0, Math.PI*2);
      ctx.fill();
    }

    // Baselines
    ctx.strokeStyle = C.LINE;
    ctx.lineWidth = 1.4;
    for (const bly of [BL1_Y, BL2_Y]) {
      ctx.beginPath(); ctx.moveTo(BL_X1, bly); ctx.lineTo(BL_X2, bly); ctx.stroke();
      // Baseline end markers
      for (const bx of [BL_X1, BL_X2]) {
        ctx.fillStyle = C.LINE;
        ctx.beginPath(); ctx.arc(bx, bly, 3.5, 0, Math.PI*2); ctx.fill();
      }
      // D semicircle
      ctx.beginPath();
      ctx.arc(CX, bly, 44, (bly === BL1_Y ? -Math.PI : 0), (bly === BL1_Y ? 0 : Math.PI));
      ctx.stroke();
    }
  }

  // ─── Pieces ──────────────────────────────────────────────────────────────
  function coinColors(type) {
    if (type === 'black')  return { base: C.BLACK_BASE, ring: C.BLACK_RING,  shine: 'rgba(160,150,150,0.22)' };
    if (type === 'white')  return { base: C.WHITE_BASE, ring: C.WHITE_RING,  shine: 'rgba(255,255,255,0.50)' };
    if (type === 'queen')  return { base: C.RED_BASE,   ring: C.RED_RING,    shine: 'rgba(255,160,110,0.38)' };
    /* striker */          return { base: C.STRIKER_BASE,ring:C.STRIKER_RING, shine: 'rgba(255,240,160,0.45)' };
  }

  function drawPiece(ctx, piece) {
    if (piece.pocketed) return;
    const { x, y, r, type } = piece;
    const col = coinColors(type);

    // Drop shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur  = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = col.base;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
    ctx.restore();

    // Outer ring
    ctx.strokeStyle = col.ring;
    ctx.lineWidth = type === 'striker' ? 2.5 : 1.8;
    ctx.beginPath(); ctx.arc(x, y, r - 2, 0, Math.PI*2); ctx.stroke();

    // Centre disc
    ctx.fillStyle = col.ring;
    ctx.beginPath(); ctx.arc(x, y, r * 0.32, 0, Math.PI*2); ctx.fill();

    // Highlight
    const hg = ctx.createRadialGradient(x - r*0.28, y - r*0.32, 1, x, y, r * 0.9);
    hg.addColorStop(0, col.shine);
    hg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();

    if (type === 'queen') {
      ctx.strokeStyle = 'rgba(255,180,80,0.65)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(x, y, r - 5, 0, Math.PI*2); ctx.stroke();
    }
    if (type === 'striker') {
      // Crosshair centre
      ctx.strokeStyle = 'rgba(180,140,0,0.7)';
      ctx.lineWidth = 1;
      const cl = r * 0.45;
      ctx.beginPath(); ctx.moveTo(x-cl,y); ctx.lineTo(x+cl,y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x,y-cl); ctx.lineTo(x,y+cl); ctx.stroke();
    }
  }

  // ─── Aim guide ───────────────────────────────────────────────────────────
  function drawAimGuide(ctx, striker, pullVec, power, rayTarget) {
    if (!striker || striker.pocketed) return;
    const { x, y } = striker;
    const len = pullVec.len();
    if (len < 4) return;

    const dir = pullVec.scale(-1 / len); // shot direction
    const maxLen = 600;
    const tx = rayTarget ? rayTarget.x : x + dir.x * maxLen;
    const ty = rayTarget ? rayTarget.y : y + dir.y * maxLen;

    // Dotted aim line
    ctx.save();
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = C.AIM;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Circle at predicted contact point
    if (rayTarget && rayTarget.hit) {
      ctx.strokeStyle = 'rgba(255,220,60,0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(tx, ty, CFG.CR, 0, Math.PI*2); ctx.stroke();
    }

    // Elastic band (pull-back line from striker to pull point)
    const px = x - dir.x * len, py = y - dir.y * len;
    ctx.strokeStyle = `rgba(100,200,50,${0.4 + power/CFG.MAX_POWER*0.5})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(px, py); ctx.stroke();
    // Pull point dot
    ctx.fillStyle = 'rgba(100,200,50,0.8)';
    ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI*2); ctx.fill();
  }

  // ─── Baseline highlight ───────────────────────────────────────────────────
  function drawBaselineHighlight(ctx, player) {
    const bly = player === 0 ? CFG.BL1_Y : CFG.BL2_Y;
    const col = player === 0 ? C.P1 : C.P2;
    ctx.fillStyle = col.replace(')', ',0.12)').replace('rgb','rgba');
    ctx.fillRect(CFG.BL_X1, bly - 20, CFG.BL_X2 - CFG.BL_X1, 40);
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(CFG.BL_X1, bly); ctx.lineTo(CFG.BL_X2, bly); ctx.stroke();
    ctx.setLineDash([]);
  }

  // ─── HUD ─────────────────────────────────────────────────────────────────
  function drawHUD(ctx, state, scores, pocketed, currentPlayer) {
    const { P1, P2, HUD_BG, MSG_BG } = C;

    // Top bar
    ctx.fillStyle = HUD_BG;
    ctx.fillRect(0, 0, CFG.SIZE, 50);

    // Player labels
    const labels = [
      { label: 'P1 ◆ BLACK', color: P1, x: 14 },
      { label: 'P2 ◆ WHITE', color: P2, x: CFG.SIZE - 14 },
    ];
    labels.forEach(({ label, color, x }, i) => {
      const active = currentPlayer === i;
      ctx.fillStyle = active ? color : 'rgba(200,200,200,0.5)';
      ctx.font = `${active ? 'bold' : ''} 14px monospace`;
      ctx.textAlign = i === 0 ? 'left' : 'right';
      ctx.fillText(label, x, 18);
      // Score
      ctx.font = 'bold 20px monospace';
      ctx.fillText(scores[i], x, 40);
      // Active arrow indicator
      if (active) {
        ctx.fillStyle = color;
        const ax = i === 0 ? 4 : CFG.SIZE - 4;
        ctx.beginPath();
        ctx.moveTo(ax, 22);
        ctx.lineTo(ax + (i===0?6:-6), 26);
        ctx.lineTo(ax, 30);
        ctx.closePath();
        ctx.fill();
      }
    });

    // Centre status
    ctx.textAlign = 'center';
    ctx.font = '13px monospace';
    ctx.fillStyle = 'rgba(200,200,200,0.7)';
    ctx.fillText(state, CFG.CX, 18);

    // Pocket count per player
    const p1Pocketed = (pocketed.black || []).length;
    const p2Pocketed = (pocketed.white || []).length;
    ctx.font = '12px monospace';
    ctx.fillStyle = 'rgba(160,160,160,0.7)';
    ctx.textAlign = 'left';
    ctx.fillText(`Pocketed: ${p1Pocketed}/9`, 14, CFG.SIZE - 8);
    ctx.textAlign = 'right';
    ctx.fillText(`Pocketed: ${p2Pocketed}/9`, CFG.SIZE - 14, CFG.SIZE - 8);
    ctx.textAlign = 'left';
  }

  // ─── Power bar ────────────────────────────────────────────────────────────
  function drawPowerBar(ctx, power, striker) {
    if (!striker) return;
    const ratio = Math.min(power / CFG.MAX_POWER, 1);
    const bw = 80, bh = 8;
    const bx = striker.x - bw/2, by = striker.y + striker.r + 10;
    ctx.fillStyle = C.POWER_BG;
    roundRect(ctx, bx, by, bw, bh, 3); ctx.fill();
    const barColor = ratio < 0.5 ? C.POWER_FG
      : ratio < 0.8 ? '#ddaa00' : '#dd3300';
    ctx.fillStyle = barColor;
    roundRect(ctx, bx, by, bw * ratio, bh, 3); ctx.fill();
  }

  // ─── Overlays ─────────────────────────────────────────────────────────────
  function drawOverlay(ctx, lines, btns) {
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(0, 0, CFG.SIZE, CFG.SIZE);

    ctx.textAlign = 'center';
    lines.forEach(({ text, font, color, y }) => {
      ctx.font   = font  || '18px monospace';
      ctx.fillStyle = color || '#eee';
      ctx.fillText(text, CFG.CX, y);
    });

    btns && btns.forEach(({ text, y, color }) => {
      ctx.fillStyle = color || 'rgba(255,255,255,0.1)';
      roundRect(ctx, CFG.CX - 110, y - 28, 220, 38, 8); ctx.fill();
      ctx.strokeStyle = color || 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1.5;
      roundRect(ctx, CFG.CX - 110, y - 28, 220, 38, 8); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(text, CFG.CX, y);
    });
    ctx.textAlign = 'left';
  }

  function drawMessage(ctx, text, color) {
    if (!text) return;
    ctx.save();
    ctx.font = 'bold 16px monospace';
    const tw = ctx.measureText(text).width;
    const px = 18, py = 8;
    ctx.fillStyle = C.MSG_BG;
    roundRect(ctx, CFG.CX - tw/2 - px, CFG.CY - 30, tw + px*2, 36, 6);
    ctx.fill();
    ctx.fillStyle = color || '#ffe060';
    ctx.textAlign = 'center';
    ctx.fillText(text, CFG.CX, CFG.CY - 8);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  // ─── Util ────────────────────────────────────────────────────────────────
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  return {
    drawBoard, drawPiece, drawAimGuide, drawBaselineHighlight,
    drawHUD, drawPowerBar, drawOverlay, drawMessage,
  };
})();
