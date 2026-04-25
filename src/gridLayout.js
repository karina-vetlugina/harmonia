import { GRID } from './config.js';

export function chooseTileCounts(vw, vh) {
  const per = GRID.COLS * GRID.ROWS;
  const maxSlots = Math.floor(GRID.MAX_DOTS / per);
  const aspect = vw / Math.max(vh, 1);
  const cap = 10;
  let tilesX = Math.min(cap, Math.max(2, Math.ceil(vw / 420)));
  let tilesY = Math.min(cap, Math.max(2, Math.ceil(vh / 300)));
  if (aspect > 1) {
    tilesX = Math.min(cap, Math.max(tilesX, Math.round(tilesY * aspect * 0.92)));
  } else {
    tilesY = Math.min(cap, Math.max(tilesY, Math.round(tilesX / Math.max(aspect, 0.01) * 0.92)));
  }
  while (tilesX * tilesY > maxSlots && tilesX > 2 && tilesY > 2) {
    if (tilesX >= tilesY) tilesX--;
    else tilesY--;
  }
  while (tilesX * tilesY > maxSlots && tilesX > 2) tilesX--;
  while (tilesX * tilesY > maxSlots && tilesY > 2) tilesY--;
  return { tilesX, tilesY };
}

export function computeWorldSize(tilesX, tilesY) {
  const worldW =
    (tilesX - 1) * GRID.TILE_W + GRID.GRID0 + (GRID.COLS - 1) * GRID.STEP + GRID.DOT_R + 12;
  const worldH =
    (tilesY - 1) * GRID.TILE_H + GRID.GRID0 + (GRID.ROWS - 1) * GRID.STEP + GRID.DOT_R + 12;
  return { worldW, worldH };
}

/** Float32 interleaved positions: x,y per dot */
export function buildDotPositions(tilesX, tilesY) {
  const { TILE_W, TILE_H, GRID0, STEP, COLS, ROWS } = GRID;
  const n = tilesX * tilesY * COLS * ROWS;
  const pos = new Float32Array(n * 2);
  let o = 0;
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      for (let j = 0; j < ROWS; j++) {
        for (let i = 0; i < COLS; i++) {
          pos[o++] = tx * TILE_W + GRID0 + i * STEP;
          pos[o++] = ty * TILE_H + GRID0 + j * STEP;
        }
      }
    }
  }
  return pos;
}

/** Slice-style: uniform scale, centered (matches former SVG preserveAspectRatio) */
export function worldToClipMat3(worldW, worldH, cw, ch) {
  const s = Math.max(cw / worldW, ch / worldH);
  const ox = (cw - worldW * s) * 0.5;
  const oy = (ch - worldH * s) * 0.5;
  const a = (2 * s) / cw;
  const b = (2 * ox) / cw - 1;
  const c = -(2 * s) / ch;
  const d = 1 - (2 * oy) / ch;
  return new Float32Array([a, 0, 0, 0, c, 0, b, d, 1]);
}

export function clientToWorld(clientX, clientY, rect, worldW, worldH, bufW, bufH) {
  const px = (clientX - rect.left) * (bufW / rect.width);
  const py = (clientY - rect.top) * (bufH / rect.height);
  const s = Math.max(bufW / worldW, bufH / worldH);
  const ox = (bufW - worldW * s) * 0.5;
  const oy = (bufH - worldH * s) * 0.5;
  return { x: (px - ox) / s, y: (py - oy) / s };
}

/** Canvas bitmap coords (same space as <canvas>.width/height) from world, inverse of clientToWorld. */
export function worldToBitmap(wx, wy, worldW, worldH, bufW, bufH) {
  const s = Math.max(bufW / worldW, bufH / worldH);
  const ox = (bufW - worldW * s) * 0.5;
  const oy = (bufH - worldH * s) * 0.5;
  return { x: wx * s + ox, y: wy * s + oy };
}

/** Normalized view coords (0–1) for color sampling, from world. */
export function worldToViewNorm(wx, wy, rect, worldW, worldH, bufW, bufH, viewW, viewH) {
  const s = Math.max(bufW / worldW, bufH / worldH);
  const ox = (bufW - worldW * s) * 0.5;
  const oy = (bufH - worldH * s) * 0.5;
  const px = wx * s + ox;
  const py = wy * s + oy;
  const clientX = rect.left + (px * rect.width) / bufW;
  const clientY = rect.top + (py * rect.height) / bufH;
  return { nx: clientX / viewW, ny: clientY / viewH };
}
