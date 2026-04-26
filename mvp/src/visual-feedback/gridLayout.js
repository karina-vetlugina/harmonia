import { GRID } from "./config.js";

export function chooseTileCounts(widthPx, heightPx) {
  const vw = widthPx;
  const vh = heightPx;
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
    if (tilesX >= tilesY) tilesX -= 1;
    else tilesY -= 1;
  }
  while (tilesX * tilesY > maxSlots && tilesX > 2) tilesX -= 1;
  while (tilesX * tilesY > maxSlots && tilesY > 2) tilesY -= 1;
  return { tilesX, tilesY };
}

export function computeWorldSize(tilesX, tilesY) {
  const worldW =
    (tilesX - 1) * GRID.TILE_W + GRID.GRID0 + (GRID.COLS - 1) * GRID.STEP + GRID.DOT_R + 12;
  const worldH =
    (tilesY - 1) * GRID.TILE_H + GRID.GRID0 + (GRID.ROWS - 1) * GRID.STEP + GRID.DOT_R + 12;
  return { worldW, worldH };
}

export function buildDotPositions(tilesX, tilesY) {
  const { TILE_W, TILE_H, GRID0, STEP, COLS, ROWS } = GRID;
  const n = tilesX * tilesY * COLS * ROWS;
  const pos = new Float32Array(n * 2);
  let o = 0;
  for (let ty = 0; ty < tilesY; ty += 1) {
    for (let tx = 0; tx < tilesX; tx += 1) {
      for (let j = 0; j < ROWS; j += 1) {
        for (let i = 0; i < COLS; i += 1) {
          pos[o++] = tx * TILE_W + GRID0 + i * STEP;
          pos[o++] = ty * TILE_H + GRID0 + j * STEP;
        }
      }
    }
  }
  return pos;
}

export function worldToClipMat3(worldW, worldH, bufW, bufH) {
  const s = Math.max(bufW / worldW, bufH / worldH);
  const ox = (bufW - worldW * s) * 0.5;
  const oy = (bufH - worldH * s) * 0.5;
  const a = (2 * s) / bufW;
  const b = (2 * ox) / bufW - 1;
  const c = -(2 * s) / bufH;
  const d = 1 - (2 * oy) / bufH;
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
