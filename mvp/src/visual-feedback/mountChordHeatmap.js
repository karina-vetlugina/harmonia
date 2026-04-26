import { chooseTileCounts, computeWorldSize, buildDotPositions, worldToClipMat3, clientToWorld } from "./gridLayout.js";
import { GridRenderer } from "./webgl/GridRenderer.js";
import { RippleStore } from "./rippleModel.js";
import { compareDyadAttempt } from "./compareDyadAttempt.js";

const PINK = { r: 232, g: 112, b: 168 };
const ORANGE = { r: 212, g: 132, b: 96 };
const MIN_KEYBOARD_MIDI = 52; // E3
const MAX_KEYBOARD_MIDI = 77; // F5

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function normalizeDistance(distance, targetMidi) {
  if (distance === 0) return 0;
  if (distance < 0) {
    const maxLeftDistance = Math.max(1, targetMidi - MIN_KEYBOARD_MIDI);
    return clamp(distance / maxLeftDistance, -1, 1);
  }
  const maxRightDistance = Math.max(1, MAX_KEYBOARD_MIDI - targetMidi);
  return clamp(distance / maxRightDistance, -1, 1);
}

/**
 * Mount the fixed-dot blob heatmap.
 * Returns null if WebGL2 is unavailable.
 *
 * The visual stays non-semantic: no text, no target lines, only blob motion.
 */
export function mountChordHeatmap(stageEl) {
  const pinkCanvas = document.createElement("canvas");
  pinkCanvas.style.cssText = "display:block;width:100%;height:100%;position:absolute;inset:0";
  const orangeCanvas = document.createElement("canvas");
  orangeCanvas.style.cssText = "display:block;width:100%;height:100%;position:absolute;inset:0";

  stageEl.style.position ||= "relative";
  stageEl.appendChild(pinkCanvas);
  stageEl.appendChild(orangeCanvas);

  const pinkGL = pinkCanvas.getContext("webgl2", { alpha: true, antialias: true, premultipliedAlpha: false });
  const orangeGL = orangeCanvas.getContext("webgl2", { alpha: true, antialias: true, premultipliedAlpha: false });
  if (!pinkGL || !orangeGL) {
    stageEl.innerHTML = "";
    return null;
  }

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
  let showFirst = false;
  let showSecond = false;

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
      bufH,
    );
  }

  function applyDistances() {
    const spread = 0.34;
    const n1 = normalizeDistance(lastD1, targetMidi1);
    const n2 = normalizeDistance(lastD2, targetMidi2);
    const center = 0.5;
    const x1 = center + n1 * spread;
    const y1 = center;
    const x2 = center;
    const y2 = center - n2 * spread;

    if (showFirst) {
      const p1 = toWorld(x1, y1);
      pinkRipples.replaceAll([{ nx: x1, ny: y1, x: p1.x, y: p1.y, r: PINK.r, g: PINK.g, b: PINK.b, createdAt: Date.now() }]);
    } else {
      pinkRipples.clear();
    }

    if (showSecond) {
      const p2 = toWorld(x2, y2);
      orangeRipples.replaceAll([{ nx: x2, ny: y2, x: p2.x, y: p2.y, r: ORANGE.r, g: ORANGE.g, b: ORANGE.b, createdAt: Date.now() }]);
    } else {
      orangeRipples.clear();
    }
  }

  function resize() {
    const rect = stageEl.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 4);
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
    /**
     * @param {{targetNotes:{midi:number}[], activeNotesOrdered:{midi:number}[]}} input
     */
    updateAttempt(input) {
      const { targetNotes, activeNotesOrdered } = input || {};
      if (!Array.isArray(targetNotes) || targetNotes.length < 2) {
        this.clear();
        return;
      }
      const cmp = compareDyadAttempt(targetNotes, activeNotesOrdered || []);
      targetMidi1 = cmp.lower.targetMidi;
      targetMidi2 = cmp.higher.targetMidi;
      lastD1 = cmp.lower.distance;
      lastD2 = cmp.higher.distance;
      showFirst = cmp.lower.show;
      showSecond = cmp.higher.show;
      applyDistances();
    },
    clear() {
      showFirst = false;
      showSecond = false;
      lastD1 = 0;
      lastD2 = 0;
      applyDistances();
    },
    destroy() {
      unsubPink();
      unsubOrange();
      ro.disconnect();
      stageEl.innerHTML = "";
    },
  };
}

