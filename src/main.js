import { GRID } from './config.js';
import {
  chooseTileCounts,
  computeWorldSize,
  buildDotPositions,
  worldToClipMat3,
  clientToWorld,
  worldToViewNorm
} from './gridLayout.js';
import { RippleStore, blendColor } from './rippleModel.js';
import { GridRenderer } from './webgl/GridRenderer.js';
import * as api from './api.js';

const stage = document.getElementById('stage');
const canvas = document.createElement('canvas');
canvas.style.cssText = 'display:block;width:100%;height:100%';
stage.appendChild(canvas);

const gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: false });
if (!gl) {
  stage.innerHTML =
    '<p style="color:#aaa;padding:2rem;font-family:system-ui">WebGL2 is required.</p>';
  throw new Error('WebGL2 unavailable');
}

const renderer = new GridRenderer(gl);
const store = new RippleStore();

const DRAG_MIN_PX = 10;
const STAMP_SPACING = GRID.DOT_R * 0.32;
const MAX_STAMPS_PER_EVENT = 160;

let worldW = 1;
let worldH = 1;
let bufW = 1;
let bufH = 1;
let resizeTimer = null;

/** @type {{ startCX: number, startCY: number, lastSample: { x: number, y: number }, pointerId: number } | null} */
let drag = null;

/**
 * Spaced ripples along the segment.
 * @param {DOMRect} rect
 */
function stampLine(ax, ay, bx, by, r, g, b, rect, viewW, viewH) {
  const dx = bx - ax;
  const dy = by - ay;
  const L = Math.hypot(dx, dy);
  if (L < 0.05) return;
  if (L < STAMP_SPACING) {
    const n = worldToViewNorm(bx, by, rect, worldW, worldH, bufW, bufH, viewW, viewH);
    store.addMany([{ nx: n.nx, ny: n.ny, x: bx, y: by, r, g, b }]);
    return;
  }
  const ux = dx / L;
  const uy = dy / L;
  const px = [];
  let d = STAMP_SPACING;
  let m = 0;
  while (d <= L + 0.01 && m < MAX_STAMPS_PER_EVENT) {
    const t = Math.min(d, L);
    px.push({ x: ax + ux * t, y: ay + uy * t });
    d += STAMP_SPACING;
    m++;
  }
  const batch = px.map((p) => {
    const n = worldToViewNorm(p.x, p.y, rect, worldW, worldH, bufW, bufH, viewW, viewH);
    return { nx: n.nx, ny: n.ny, x: p.x, y: p.y, r, g, b };
  });
  store.addMany(batch);
}

function layout() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  bufW = canvas.width;
  bufH = canvas.height;

  const tc = chooseTileCounts(w, h);
  const { tilesX, tilesY } = tc;
  const ws = computeWorldSize(tilesX, tilesY);
  worldW = ws.worldW;
  worldH = ws.worldH;

  const pos = buildDotPositions(tilesX, tilesY);
  renderer.setDotPositions(pos);

  const rect = canvas.getBoundingClientRect();
  store.remapToWorld(rect, worldW, worldH, canvas.width, canvas.height, w, h);

  redraw();
}

function redraw() {
  const mat = worldToClipMat3(worldW, worldH, canvas.width, canvas.height);
  renderer.draw(mat, store.items);
}

layout();
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    layout();
  }, 120);
});

store.subscribe(() => redraw());

const vw0 = () => window.innerWidth;
const vh0 = () => window.innerHeight;

function onPointerDown(e) {
  if (e.button !== 0) return;
  if (e.shiftKey) {
    store.clear();
    void api.deleteAllRipplesRemote().catch((err) => console.warn(err));
    drag = null;
    redraw();
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const w = clientToWorld(e.clientX, e.clientY, rect, worldW, worldH, bufW, bufH);
  drag = {
    startCX: e.clientX,
    startCY: e.clientY,
    lastSample: { x: w.x, y: w.y },
    pointerId: e.pointerId
  };
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
  redraw();
}

function onPointerMove(e) {
  if (!drag) return;
  if (e.pointerId !== drag.pointerId) return;

  const rect = canvas.getBoundingClientRect();
  const w = clientToWorld(e.clientX, e.clientY, rect, worldW, worldH, bufW, bufH);
  const c = blendColor(e.clientX / vw0(), e.clientY / vh0());
  stampLine(drag.lastSample.x, drag.lastSample.y, w.x, w.y, c.r, c.g, c.b, rect, vw0(), vh0());
  drag.lastSample = { x: w.x, y: w.y };
  redraw();
}

async function onPointerUp(e) {
  if (!drag) return;
  if (e.pointerId !== drag.pointerId) return;

  try {
    canvas.releasePointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }

  const rect = canvas.getBoundingClientRect();
  const endW = clientToWorld(e.clientX, e.clientY, rect, worldW, worldH, bufW, bufH);
  const nx = e.clientX / vw0();
  const ny = e.clientY / vh0();
  const col = blendColor(nx, ny);
  const dx = e.clientX - drag.startCX;
  const dy = e.clientY - drag.startCY;
  const moved = dx * dx + dy * dy >= DRAG_MIN_PX * DRAG_MIN_PX;

  if (moved) {
    const n0 = store.items.length;
    stampLine(drag.lastSample.x, drag.lastSample.y, endW.x, endW.y, col.r, col.g, col.b, rect, vw0(), vh0());
    if (store.items.length === n0) {
      store.add({ nx, ny, x: endW.x, y: endW.y, r: col.r, g: col.g, b: col.b });
    }
    const last = store.items[store.items.length - 1];
    try {
      await api.postRipple(last);
    } catch (err) {
      console.warn(err);
    }
  } else {
    const ripple = store.add({ nx, ny, x: endW.x, y: endW.y, r: col.r, g: col.g, b: col.b });
    try {
      await api.postRipple(ripple);
    } catch (err) {
      console.warn(err);
    }
  }

  drag = null;
  redraw();
}

function onPointerCancel(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  try {
    canvas.releasePointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
  drag = null;
  redraw();
}

canvas.addEventListener('pointerdown', onPointerDown);
canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerup', onPointerUp);
canvas.addEventListener('pointercancel', onPointerCancel);

/** Optional: hydrate from backend when VITE_API_BASE is set */
async function hydrate() {
  try {
    const remote = await api.fetchRipples();
    if (Array.isArray(remote) && remote.length) {
      store.replaceAll(
        remote.map((r) => ({
          id: r.id,
          nx: r.nx,
          ny: r.ny,
          x: 0,
          y: 0,
          r: r.r,
          g: r.g,
          b: r.b,
          createdAt: r.createdAt
        }))
      );
      const rect = canvas.getBoundingClientRect();
      store.remapToWorld(rect, worldW, worldH, canvas.width, canvas.height, window.innerWidth, window.innerHeight);
      redraw();
    }
  } catch {
    /* no API */
  }
}

if (import.meta.env.VITE_API_BASE) {
  hydrate();
}

export { store, renderer, layout, redraw, GRID };
