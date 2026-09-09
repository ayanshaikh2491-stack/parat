/**
 * dedup.js — LAYER 2 (DEDUP)
 *
 * Kaam: ek hi request pehle se CHAL RAHI hai to dobara shuru nahi karni.
 * Same key wale sab log usi ek promise ka result share karte hain.
 * Ek computation → jitne bhi callers chahein.
 */

class Dedup {
  constructor() {
    this.inflight = new Map(); // key -> Promise
  }

  /** agar ye key pehle se chal rahi hai → wahi promise do. Nahi to starter() chala ke promise banao. */
  run(key, starter) {
    if (this.inflight.has(key)) return this.inflight.get(key);
    const p = Promise.resolve().then(() => starter());
    this.inflight.set(key, p);
    // settle hone pe hata do — agli baar fresh chale (cache layer sambhalegi)
    p.finally(() => { this.inflight.delete(key); }).catch(() => {});
    return p;
  }

  /** kaunsi keys chal rahi hain */
  active() { return [...this.inflight.keys()]; }
  get size() { return this.inflight.size; }
}

module.exports = { Dedup };
