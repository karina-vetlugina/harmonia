import { COLOR_ANCHORS, MAX_RIPPLES } from './config.js';
import { clientToWorld as clientToWorldPx } from './gridLayout.js';

export function blendColor(nx, ny) {
  const eps = 0.06;
  let wr = 0;
  let wg = 0;
  let wb = 0;
  let wsum = 0;
  for (const a of COLOR_ANCHORS) {
    const dx = nx - a.x;
    const dy = ny - a.y;
    const w = 1 / (eps + dx * dx + dy * dy);
    wsum += w;
    wr += w * a.r;
    wg += w * a.g;
    wb += w * a.b;
  }
  return { r: wr / wsum, g: wg / wsum, b: wb / wsum };
}

/**
 * Serializable ripple for API / persistence.
 * @typedef {{ id?: string, nx: number, ny: number, x: number, y: number, r: number, g: number, b: number, createdAt?: number }} Ripple
 */

export class RippleStore {
  constructor() {
    /** @type {Ripple[]} */
    this.items = [];
    this._listeners = new Set();
  }

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit() {
    for (const fn of this._listeners) fn(this.items);
  }

  /**
   * @param {Partial<Ripple> & { nx: number, ny: number, x: number, y: number }} r
   */
  add(r) {
    if (this.items.length >= MAX_RIPPLES) this.items.shift();
    const full = {
      id: r.id ?? crypto.randomUUID?.() ?? String(Date.now()),
      nx: r.nx,
      ny: r.ny,
      x: r.x,
      y: r.y,
      r: r.r,
      g: r.g,
      b: r.b,
      createdAt: r.createdAt ?? Date.now()
    };
    this.items.push(full);
    this._emit();
    return full;
  }

  /**
   * @param {Array<Partial<Ripple> & { nx: number, ny: number, x: number, y: number, r: number, g: number, b: number }>} list
   */
  addMany(list) {
    if (list.length === 0) return;
    const t = Date.now();
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (this.items.length >= MAX_RIPPLES) this.items.shift();
      const id = r.id ?? (crypto.randomUUID ? crypto.randomUUID() : `r-${t}-${i}-${Math.random()}`);
      this.items.push({
        id,
        nx: r.nx,
        ny: r.ny,
        x: r.x,
        y: r.y,
        r: r.r,
        g: r.g,
        b: r.b,
        createdAt: r.createdAt ?? t
      });
    }
    this._emit();
  }

  clear() {
    this.items.length = 0;
    this._emit();
  }

  /** @param {Ripple[]} snapshot */
  replaceAll(snapshot) {
    this.items.length = 0;
    for (const r of snapshot.slice(0, MAX_RIPPLES)) this.items.push(r);
    this._emit();
  }

  /** Recompute world x,y from normalized coords after resize */
  remapToWorld(rect, worldW, worldH, bufW, bufH, innerW, innerH) {
    for (const r of this.items) {
      const p = clientToWorldPx(r.nx * innerW, r.ny * innerH, rect, worldW, worldH, bufW, bufH);
      r.x = p.x;
      r.y = p.y;
    }
  }
}
