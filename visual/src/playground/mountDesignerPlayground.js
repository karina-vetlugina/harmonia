import { chooseTileCounts, computeWorldSize, buildDotPositions, worldToClipMat3, clientToWorld } from '../gridLayout.js';
import { GridRenderer } from '../webgl/GridRenderer.js';
import { RippleStore } from '../rippleModel.js';

const PINK = { r: 232, g: 112, b: 168 };
const ORANGE = { r: 212, g: 132, b: 96 };
const MIN_KEYBOARD_MIDI = 52;
const MAX_KEYBOARD_MIDI = 77;

export function mountDesignerPlayground(stageEl) {
  const pinkCanvas = document.createElement('canvas');
  pinkCanvas.style.cssText = 'display:block;width:100%;height:100%;position:absolute;inset:0';
  const orangeCanvas = document.createElement('canvas');
  orangeCanvas.style.cssText = 'display:block;width:100%;height:100%;position:absolute;inset:0';
  stageEl.appendChild(pinkCanvas);
  stageEl.appendChild(orangeCanvas);

  const pinkGL = pinkCanvas.getContext('webgl2', {
    alpha: true,
    antialias: true,
    premultipliedAlpha: false
  });
  const orangeGL = orangeCanvas.getContext('webgl2', {
    alpha: true,
    antialias: true,
    premultipliedAlpha: false
  });
  if (!pinkGL || !orangeGL) throw new Error('WebGL2 unavailable');

  const pinkRenderer = new GridRenderer(pinkGL);
  const orangeRenderer = new GridRenderer(orangeGL);
  const pinkRipples = new RippleStore();
  const orangeRipples = new RippleStore();

  let worldW = 1;
  let worldH = 1;
  let bufW = 1;
  let bufH = 1;
  let lastD1 = 0;
  let lastD2 = 0;
  let targetMidi1 = 55;
  let targetMidi2 = 60;
  let showFirst = true;
  let hasSecond = false;

  function draw() {
    const pinkMat = worldToClipMat3(worldW, worldH, pinkCanvas.width, pinkCanvas.height);
    pinkRenderer.draw(pinkMat, pinkRipples.items);
    const orangeMat = worldToClipMat3(worldW, worldH, orangeCanvas.width, orangeCanvas.height);
    orangeRenderer.draw(orangeMat, orangeRipples.items);
  }

  function toWorld(nx, ny) {
    const rect = pinkCanvas.getBoundingClientRect();
    return clientToWorld(
      rect.left + nx * rect.width,
      rect.top + ny * rect.height,
      rect,
      worldW,
      worldH,
      bufW,
      bufH
    );
  }

  function applyDistances() {
    const spread = 0.22;
    function normalizeDistance(distance, targetMidi) {
      if (distance === 0) return 0;
      if (distance < 0) {
        const maxLeftDistance = Math.max(1, targetMidi - MIN_KEYBOARD_MIDI);
        return Math.max(-1, Math.min(1, distance / maxLeftDistance));
      }
      const maxRightDistance = Math.max(1, MAX_KEYBOARD_MIDI - targetMidi);
      return Math.max(-1, Math.min(1, distance / maxRightDistance));
    }
    const n1 = normalizeDistance(lastD1, targetMidi1);
    const n2 = normalizeDistance(lastD2, targetMidi2);
    const x1 = 1 / 3 + n1 * spread;
    const x2 = 2 / 3 + n2 * spread;
    const y1 = 0.54;
    const y2 = 0.58;
    if (showFirst) {
      const p1 = toWorld(x1, y1);
      pinkRipples.replaceAll([
        { nx: x1, ny: y1, x: p1.x, y: p1.y, r: PINK.r, g: PINK.g, b: PINK.b, createdAt: Date.now() }
      ]);
    } else {
      pinkRipples.clear();
    }
    if (hasSecond) {
      const p2 = toWorld(x2, y2);
      orangeRipples.replaceAll([
        { nx: x2, ny: y2, x: p2.x, y: p2.y, r: ORANGE.r, g: ORANGE.g, b: ORANGE.b, createdAt: Date.now() }
      ]);
    } else {
      orangeRipples.clear();
    }
  }

  function resize() {
    const rect = stageEl.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    pinkCanvas.width = Math.floor(rect.width * dpr);
    pinkCanvas.height = Math.floor(rect.height * dpr);
    orangeCanvas.width = Math.floor(rect.width * dpr);
    orangeCanvas.height = Math.floor(rect.height * dpr);
    bufW = pinkCanvas.width;
    bufH = pinkCanvas.height;
    const tiles = chooseTileCounts(rect.width, rect.height);
    const size = computeWorldSize(tiles.tilesX, tiles.tilesY);
    worldW = size.worldW;
    worldH = size.worldH;
    const dots = buildDotPositions(tiles.tilesX, tiles.tilesY);
    pinkRenderer.setDotPositions(dots);
    orangeRenderer.setDotPositions(dots);
    applyDistances();
    draw();
  }

  const unsubPink = pinkRipples.subscribe(draw);
  const unsubOrange = orangeRipples.subscribe(draw);
  const ro = new ResizeObserver(() => resize());
  ro.observe(stageEl);
  resize();

  return {
    updateDistances(distance1, distance2, showSecond, target1, target2, showPink) {
      lastD1 = distance1;
      lastD2 = distance2;
      if (typeof target1 === 'number') targetMidi1 = target1;
      if (typeof target2 === 'number') targetMidi2 = target2;
      if (typeof showPink === 'boolean') showFirst = showPink;
      hasSecond = Boolean(showSecond);
      applyDistances();
    },
    destroy() {
      unsubPink();
      unsubOrange();
      ro.disconnect();
      stageEl.innerHTML = '';
    }
  };
}
