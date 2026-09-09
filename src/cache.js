/**
 * cache.js — LAYER 1 (CACHE)
 *
 * Kaam: same sawab dobara compute nahi karna.
 * Key-value + TTL (baad mein khud expire).
 * Jab ye layer kuch kha jaye = L5 compute bilkul nahi chala.
 */

class Cache {
  constructor() {
    this.map = new Map(); // key -> { value, expires }
  }

  /** value save — ttlMs baad expire (ttl nahi = hamesha) */
  set(key, value, ttlMs) {
    const expires = ttlMs ? Date.now() + ttlMs : Infinity;
    this.map.set(key, { value, expires });
    return value;
  }

  /** value lao — undefined = miss (ya expire ho gaya) */
  get(key) {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expires) { this.map.delete(key); return undefined; }
    return e.value;
  }

  has(key) { return this.get(key) !== undefined; }
  delete(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
  get size() { return this.map.size; }
}

module.exports = { Cache };
