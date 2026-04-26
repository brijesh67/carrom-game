# Carrom Board Game — Project Summary

## Overview
A browser-based 2-player carrom board game built with vanilla JS and Canvas 2D API. No external dependencies, no build step. Open `index.html` directly in a browser to play.

**Live URL:** https://brijesh67.github.io/carrom-game/

---

## File Structure

```
carrom/
├── index.html        # Entry point — loads scripts in order
├── styles.css        # Layout, canvas scaling, dark background
└── js/
    ├── config.js     # All constants (sizes, physics, colors)
    ├── vec2.js       # Vec2 math helper class
    ├── sound.js      # Procedural audio via Web Audio API
    ├── physics.js    # Fixed-timestep physics engine
    ├── renderer.js   # All canvas drawing functions
    ├── input.js      # Mouse input handler
    ├── rules.js      # Game rules & state machine
    └── game.js       # Main game class & loop
```

---

## Features

- Realistic physics: friction, elastic collisions, pocket detection
- Pull-back slingshot striker mechanic (drag back to aim and power up)
- 2-player turn-based on a single device (both players use the bottom baseline)
- Queen cover rules: pocket queen → must cover it same shot or next shot, or queen returns to centre
- Scoring: opponent's remaining coins + 3-point queen bonus
- Fouls: striker pocketed returns a coin; missing all coins loses the turn
- Procedural sound effects (hit, pocket, foul, win)
- Game over screen with "New Round" and "Reset All" options

---

## Architecture

### State Machine (rules.phase)
```
MENU → PLACING → AIMING → SHOOTING → PLACING (next turn)
                                    → GAME_OVER
```

### Physics (physics.js)
- Fixed timestep: 120 Hz (`PHYS_DT = 1/120`)
- Accumulator pattern in `_tickShooting` — runs multiple steps per frame
- `applyFriction`: Coulomb model, zeroes velocity below `MIN_SPEED`
- `wallBounce`: reflects off board edges with `WALL_REST` coefficient
- `resolveCirclePair`: impulse-based elastic collision + positional correction (4 iterations)
- `detectPockets`: piece centre within `PD` radius of corner → pocketed
- `allStopped`: checks speed² < 0.25 for all non-pocketed pieces

### Key Config Values
| Constant | Value | Meaning |
|---|---|---|
| `FRICTION` | 700 px/s² | Deceleration (coins stop in ~1–2s) |
| `RESTITUTION` | 0.80 | Piece-piece bounce |
| `WALL_REST` | 0.72 | Piece-wall bounce |
| `MAX_POWER` | 1200 px/s | Max shot speed |
| `MAX_PULL` | 130 px | Max slingshot pull distance |
| `PHYS_ITER` | 4 | Collision resolution iterations per step |

### Striker Mechanic
1. **PLACING**: striker follows mouse along bottom baseline
2. **AIMING**: player clicks near striker and drags backward; striker moves to pulled position clamped to `MAX_PULL`; release fires
3. Shot direction = from pulled position toward anchor (slingshot); power = proportional to pull distance
4. Both players use the bottom baseline (`BL1_Y = 556`); striker color distinguishes them (P1 = gold, P2 = orange-red)

---

## Bugs Fixed

### 1. P2 Baseline Bug
**Symptom:** Game stopped working after P1's first turn.
**Cause:** P2's striker spawned at the top baseline (`BL2_Y = 164`), but players were clicking at the bottom. No interaction registered.
**Fix:** Both players now use `BL1_Y` (bottom baseline). Striker `player` property added for color differentiation.

### 2. Sound Freeze
**Symptom:** Game froze when striker hit coins.
**Cause:** `Sound.hit()` created a new `OscillatorNode + GainNode` pair for every collision pair at every physics step — potentially hundreds of AudioNodes per second, overwhelming the Web Audio API.
**Fix:** Debounced `Sound.hit()` to fire at most once every 120ms (~8×/sec).

### 3. Game Loop Crash (root cause of main freeze bug)
**Symptom:** After the striker hit any coin, the game permanently froze.
**Cause:** In `rules.js`, `resolveTurn` destructured only `{ ownCoinPocketed, strikerPocketed }` from `turnResult` but used `queenPocketedNow` on line 134 without declaring it. In strict mode (`'use strict'`), this throws `ReferenceError` on every normal shot (any turn where the striker doesn't pocket itself). The exception propagated out of `_loop`, preventing `requestAnimationFrame` from being rescheduled — permanently killing the game loop.
**Fix:** Added `queenPocketedNow` to the destructuring: `const { ownCoinPocketed, strikerPocketed, queenPocketedNow } = turnResult;`

### 4. Slow Physics / Coins Rolling Too Long
**Symptom:** After hitting coins, the striker appeared idle near the baseline but the game didn't advance — looked frozen.
**Cause:** `FRICTION = 270` was too low. A coin hit at full power received ~1400 px/s and took 5+ seconds to stop. The striker (heavier) bounced back near the baseline quickly while distant coins kept slowly rolling.
**Fix:** Increased `FRICTION` from 270 to 700. Added 5-second safety timeout as a fallback. Changed `allStopped` to use speed² < 0.25 epsilon instead of exact zero.

---

## Deployment
Hosted on GitHub Pages via the `carrom-game` repository under the `brijesh67` account. Push to `main` branch to deploy.
