'use strict';

// ─── Game Rules & State Machine ───────────────────────────────────────────────
// Phases: MENU → PLACING → AIMING → SHOOTING → PROCESSING → RESULT → GAME_OVER

class Rules {
  constructor() {
    this.reset();
  }

  reset() {
    // Round state
    this.phase         = 'MENU';
    this.currentPlayer = 0;            // 0 = P1 (black), 1 = P2 (white)
    this.playerColors  = ['black', 'white'];

    // Pocketed coins stored here (removed from board)
    this.pocketed = { black: [], white: [], queen: false };

    // Queen mechanic
    this.queenOnBoard    = true;   // queen still in play
    this.queenNeedsCover = false;  // queen pocketed, awaiting cover
    this.queenHolder     = -1;     // who pocketed queen
    this.queenCovered    = false;  // queen fully covered

    // Scores (persist across rounds)
    this.scores      = [0, 0];
    this.roundOver   = false;
    this.winner      = -1;

    // UI
    this.message     = '';
    this.messageColor = '#ffe060';
    this.msgTimer    = 0;

    // Whether this turn earned an extra shot
    this.extraShot   = false;
    this.foul        = false;

    // Sound hit tracking (avoid re-firing for same collision pair this step)
    this._lastHitPairs = new Set();
  }

  // Call once at start of a new round (resets board but not scores)
  startRound() {
    this.phase         = 'PLACING';
    this.currentPlayer = 0;
    this.pocketed      = { black: [], white: [], queen: false };
    this.queenOnBoard    = true;
    this.queenNeedsCover = false;
    this.queenHolder     = -1;
    this.queenCovered    = false;
    this.roundOver       = false;
    this.winner          = -1;
    this.extraShot       = false;
    this.foul            = false;
    this.setMessage('P1 — Place & shoot!');
  }

  get myColor() { return this.playerColors[this.currentPlayer]; }
  get oppColor() { return this.playerColors[1 - this.currentPlayer]; }

  setMessage(text, color, duration = 2.5) {
    this.message      = text;
    this.messageColor = color || '#ffe060';
    this.msgTimer     = duration;
  }

  tickMessage(dt) {
    if (this.msgTimer > 0) { this.msgTimer -= dt; if (this.msgTimer <= 0) this.message = ''; }
  }

  // ─── Called after every physics step when pieces pocket ────────────────────
  // Returns list of newly pocketed piece objects (mutates their .pocketed flag)
  processPocketed(newlyPocketed, pieces) {
    let ownCoinPocketed = 0;
    let strikerPocketed = false;
    let queenPocketedNow = false;

    for (const p of newlyPocketed) {
      if (p.type === 'striker') {
        strikerPocketed = true;
        Sound.pocket();
      } else if (p.type === 'queen') {
        this.pocketed.queen = true;
        this.queenOnBoard   = false;
        this.queenHolder    = this.currentPlayer;
        this.queenNeedsCover = true;
        queenPocketedNow    = true;
        Sound.pocket();
      } else {
        this.pocketed[p.type].push(p);
        if (p.type === this.myColor) { ownCoinPocketed++; Sound.pocket(); }
        else { Sound.pocket(); }
      }
    }

    return { ownCoinPocketed, strikerPocketed, queenPocketedNow };
  }

  // ─── Called once all pieces have stopped (end of shot) ────────────────────
  // pieces: all piece objects (to mutate queen back to board if uncovered)
  // queenPiece: the queen piece object (to reset position)
  resolveTurn(turnResult, queenPiece) {
    const { ownCoinPocketed, strikerPocketed } = turnResult;

    this.foul        = false;
    this.extraShot   = false;

    // ── Foul: striker pocketed ──────────────────────────────────────────────
    if (strikerPocketed) {
      this.foul = true;
      Sound.foul();
      const arr = this.pocketed[this.myColor];
      if (arr.length > 0) {
        const coin = arr.pop();
        coin.pocketed = false;
        coin.x = CFG.CX + (Math.random()-0.5)*80;
        coin.y = CFG.CY + (Math.random()-0.5)*80;
        coin.vx = coin.vy = 0;
      }
      // Queen awaiting cover also returns on foul
      if (this.queenNeedsCover && this.queenHolder === this.currentPlayer) {
        this._returnQueen(queenPiece);
        this.setMessage('Foul! Striker pocketed — queen returned', '#ff4444', 3);
      } else {
        this.setMessage('Foul! Striker pocketed — coin returned', '#ff4444', 3);
      }
      this._switchPlayer();
      return;
    }

    // ── Queen pocketed this shot ───────────────────────────────────────────
    if (queenPocketedNow) {
      if (ownCoinPocketed > 0) {
        // Covered same shot — queen stays
        this.queenNeedsCover = false;
        this.queenCovered    = true;
        this.setMessage('Queen pocketed & covered! Play again', '#ffcc00', 3);
        this.extraShot = true;
        this._checkWin();
        return;
      } else {
        // Give player ONE extra shot to cover
        this.queenNeedsCover = true;
        this.queenHolder     = this.currentPlayer;
        this.setMessage('Queen pocketed! Cover it next shot or it returns', '#ffaa00', 4);
        this.extraShot = true;
        return;
      }
    }

    // ── Cover shot (queenNeedsCover set on previous turn) ─────────────────
    if (this.queenNeedsCover && this.queenHolder === this.currentPlayer) {
      if (ownCoinPocketed > 0) {
        this.queenNeedsCover = false;
        this.queenCovered    = true;
        this.setMessage('Queen covered! Play again', '#ffcc00', 2.5);
        this.extraShot = true;
        this._checkWin();
        return;
      } else {
        // Failed to cover — queen returns, lose turn
        this._returnQueen(queenPiece);
        this.queenNeedsCover = false;
        this.queenHolder     = -1;
        this.setMessage('Queen not covered — returned to centre', '#ff8844', 2.5);
        this._switchPlayer();
        return;
      }
    }

    // ── Normal turn ────────────────────────────────────────────────────────
    if (ownCoinPocketed > 0) {
      this.extraShot = true;
      this.setMessage(`+${ownCoinPocketed} pocketed! Play again`, '#88ff88', 2);
    } else {
      this._switchPlayer();
    }

    this._checkWin();
  }

  _returnQueen(queenPiece) {
    if (!queenPiece) return;
    queenPiece.pocketed = false;
    queenPiece.x = CFG.CX;
    queenPiece.y = CFG.CY;
    queenPiece.vx = queenPiece.vy = 0;
    this.pocketed.queen  = false;
    this.queenOnBoard    = true;
  }

  _switchPlayer() {
    this.currentPlayer = 1 - this.currentPlayer;
    const name = `P${this.currentPlayer+1}`;
    const colorLabel = this.myColor === 'black' ? 'BLACK' : 'WHITE';
    this.setMessage(`${name}'s turn (${colorLabel})`, this.currentPlayer === 0 ? '#3399ff' : '#ff6633', 2);
  }

  _checkWin() {
    const p1Done = this.pocketed.black.length >= 9;
    const p2Done = this.pocketed.white.length >= 9;

    if (!p1Done && !p2Done) return;

    const winnerIdx = p1Done ? 0 : 1;
    this.winner    = winnerIdx;
    this.roundOver = true;
    this.phase     = 'GAME_OVER';

    // Score: opponent's remaining coins + queen bonus
    const oppColor = this.playerColors[1 - winnerIdx];
    const oppRemaining = 9 - this.pocketed[oppColor].length;
    let pts = oppRemaining;
    if (this.queenCovered && this.queenHolder === winnerIdx) pts += 3;
    this.scores[winnerIdx] += pts;

    Sound.win();
    this.setMessage(
      `P${winnerIdx+1} wins! +${pts} points`,
      winnerIdx === 0 ? '#3399ff' : '#ff6633',
      60
    );
  }

  phaseLabel() {
    const map = {
      MENU:      'MENU',
      PLACING:   `P${this.currentPlayer+1} — Hover to position, click & drag striker to pull`,
      AIMING:    `P${this.currentPlayer+1} — Release to fire!`,
      SHOOTING:  'Shooting…',
      GAME_OVER: 'Game Over',
    };
    return map[this.phase] || this.phase;
  }
}
