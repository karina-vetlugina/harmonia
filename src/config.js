export const GRID = {
  /** World-space radius of each dot. STEP and counts are 2× coarser (each new cell ≈ 2×2 old cells). */
  DOT_R: 20,
  GRID0: 10,
  STEP: 50,
  COLS: 29,
  ROWS: 21,
  MAX_DOTS: 42000,
  get RIPPLE_SIGMA() {
    return this.STEP * 5.35;
  },
  get TILE_W() {
    return this.COLS * this.STEP;
  },
  get TILE_H() {
    return this.ROWS * this.STEP;
  }
};

export const MAX_RIPPLES = 64;

export const COLOR_ANCHORS = [
  { x: 0.5, y: 0.4, r: 176, g: 238, b: 208 },
  { x: 0.9, y: 0.14, r: 232, g: 112, b: 168 },
  { x: 0.12, y: 0.86, r: 212, g: 132, b: 96 }
];
