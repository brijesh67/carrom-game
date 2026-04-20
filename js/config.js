'use strict';

const CFG = {
  // Canvas
  SIZE: 720,

  // Playing surface (inside wooden frame)
  BX: 56, BY: 56, BS: 608,

  // Physics
  FRICTION:     270,   // px/s² deceleration (Coulomb model)
  RESTITUTION:  0.80,  // piece-piece bounce coefficient
  WALL_REST:    0.72,  // piece-wall bounce
  MIN_SPEED:    1.2,   // velocity threshold to stop piece (px/s)
  PHYS_DT:      1/120, // fixed physics timestep (s)
  PHYS_ITER:    4,     // collision resolution iterations per step

  // Pieces
  CR: 13,   // coin radius
  SR: 19,   // striker radius

  // Pocket
  PR: 25,   // pocket visual radius
  PD: 28,   // pocket detection radius (slightly larger for feel)

  // Shot
  MAX_PULL:  130,   // max pull-back pixels
  MAX_POWER: 1200,  // max shot speed px/s
  MIN_POWER:  80,   // min speed to count as a shot

  // Baselines
  BL_OFFSET: 108,  // from near edge of playing surface
  BL_PAD:     82,  // side margin for striker x placement

  // Coin ring radii from center
  INNER_R: 29,
  OUTER_R: 58,

  COLORS: {
    FRAME:       '#3a1e0a',
    FRAME_IN:    '#5c2e12',
    SURFACE:     '#c4902a',
    SURFACE2:    '#b47c1a',
    LINE:        '#8b5a00',
    POCKET:      '#0a0a0a',
    BLACK_BASE:  '#1a1717',
    BLACK_RING:  '#302c2c',
    WHITE_BASE:  '#e8e0cc',
    WHITE_RING:  '#f4f0e4',
    RED_BASE:    '#c01600',
    RED_RING:    '#e83418',
    STRIKER_BASE:'#d8b828',
    STRIKER_RING:'#eecc40',
    P1:          '#3399ff',
    P2:          '#ff6633',
    AIM:         'rgba(255,220,60,0.80)',
    AIM_DOT:     'rgba(255,220,60,0.45)',
    POWER_FG:    '#44dd44',
    POWER_BG:    'rgba(0,0,0,0.5)',
    MSG_BG:      'rgba(10,10,20,0.82)',
    HUD_BG:      'rgba(0,0,0,0.65)',
  },
};

// Derived geometry (computed once)
CFG.B2X = CFG.BX + CFG.BS;        // right edge  = 664
CFG.B2Y = CFG.BY + CFG.BS;        // bottom edge = 664
CFG.CX  = CFG.BX + CFG.BS / 2;   // center x    = 360
CFG.CY  = CFG.BY + CFG.BS / 2;   // center y    = 360
CFG.BL1_Y = CFG.B2Y - CFG.BL_OFFSET; // P1 baseline y = 556
CFG.BL2_Y = CFG.BY  + CFG.BL_OFFSET; // P2 baseline y = 164
CFG.BL_X1 = CFG.BX  + CFG.BL_PAD;    // baseline x-min= 138
CFG.BL_X2 = CFG.B2X - CFG.BL_PAD;    // baseline x-max= 582
CFG.POCKETS = [
  { x: CFG.BX,  y: CFG.BY  },
  { x: CFG.B2X, y: CFG.BY  },
  { x: CFG.BX,  y: CFG.B2Y },
  { x: CFG.B2X, y: CFG.B2Y },
];
