export const GRID = {
  /** World-space radius of each dot. */
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
  },
};

export const MAX_RIPPLES = 64;
