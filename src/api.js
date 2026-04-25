/**
 * HTTP helpers for syncing ripples with your backend.
 * Point Vite's proxy at your API (see vite.config.js) or set VITE_API_BASE.
 */

const base = () => (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

export async function postRipple(ripple) {
  const b = base();
  if (!b) return { ok: false, skipped: true };
  const res = await fetch(`${b}/api/ripples`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ripple)
  });
  if (!res.ok) throw new Error(`postRipple ${res.status}`);
  return res.json().catch(() => ({}));
}

export async function fetchRipples() {
  const b = base();
  if (!b) return [];
  const res = await fetch(`${b}/api/ripples`);
  if (!res.ok) throw new Error(`fetchRipples ${res.status}`);
  return res.json();
}

export async function deleteAllRipplesRemote() {
  const b = base();
  if (!b) return;
  const res = await fetch(`${b}/api/ripples`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(`deleteAllRipples ${res.status}`);
}
