/**
 * parat.js — LAYER PIPELINE (L1→L2→L3→L4→L5)
 *
 * Developer sirf task likhta hai (L5 compute). PARAT uske aage
 * 4 layers lagata hai jo kaam KAM karte hain:
 *
 *   L1 cache  → same jawab? seedha do (compute 0)
 *   L2 dedup  → same request chal rahi? share (compute 1, callers N)
 *   L3 batch  → chhote same-type jodke ek compute
 *   L4 queue  → peak pe line, concurrency cap
 *   L5 task   → asli kaam (sirf minimum yahan pahuncha)
 *
 * stats() se har layer ka bacha-hua kaam dikhta hai.
 */

const { Cache } = require('./cache.js');
const { Dedup } = require('./dedup.js');
const { Batcher } = require('./batch.js');
const { Queue } = require('./queue.js');

class Parat {
  constructor() {
    this.tasks = new Map();
    this.cache = new Cache();
    this.dedup = new Dedup();
    this.queue = new Queue();
    this.statsData = { requests: 0, cacheHits: 0, dedupMerges: 0, batched: 0, queued: 0, computed: 0, errors: 0 };
  }

  /**
   * Task register karo.
   * @param {string} name
   * @param {Function} fn — asli kaam (input) => result   [L5]
   *        YA batch mode: fn.batch = true → fn(inputs[]) => results[]
   * @param {object} opts — { cacheTtl, dedup, batch: {maxSize,windowMs}, concurrency }
   */
  task(name, fn, opts = {}) {
    this.tasks.set(name, { fn, opts });
    if (opts.batch) this.setupBatch(name, fn, opts.batch);
    return this;
  }

  /** batch-mode task ka batcher wire karo */
  setupBatch(name, fn, bOpts) {
    const t = this.tasks.get(name);
    t.batcher = new Batcher({ maxSize: bOpts.maxSize || 10, windowMs: bOpts.windowMs || 50 });
    t.batcher.onBatch(async (items) => {
      this.statsData.batched += items.length;
      return fn(items); // batch fn: ek call, saare results
    });
  }

  /** Task chalao — layers khud lagengi */
  run(name, input) {
    const t = this.tasks.get(name);
    if (!t) return Promise.reject(new Error('unknown task: ' + name));
    this.statsData.requests++;

    const key = this.keyOf(name, input);

    // L1 — CACHE
    if (t.opts.cacheTtl) {
      const hit = this.cache.get(key);
      if (hit !== undefined) {
        this.statsData.cacheHits++;
        return Promise.resolve(hit.value);
      }
    }

    // L2 — DEDUP (cache miss ke baad — chal rahi hai to share karo)
    if (t.opts.dedup !== false) {
      return this.dedup.run(key, () => this.throughBatchQueueCache(t, key, input));
    }
    return this.throughBatchQueueCache(t, key, input);
  }

  /** L3 batch / L4 queue / cache-write — helper */
  async throughBatchQueueCache(t, key, input) {
    // L3 — BATCH (agar task batch hai to batcher ke through jao)
    let result;
    if (t.batcher) {
      result = await t.batcher.add(input);
    } else {
      // L4 — QUEUE (concurrency cap — peak pe line)
      this.statsData.queued++;
      result = await this.queue.submit(async () => {
        this.statsData.computed++; // asli compute yahan count
        return t.fn(input);
      });
    }
    // L1 write — result cache mein daalo (agli baar free)
    if (t.opts.cacheTtl && result !== undefined) {
      this.cache.set(key, { value: result }, t.opts.cacheTtl);
    }
    return result;
  }

  /** cache key — task + input se (stable stringify) */
  keyOf(name, input) {
    try {
      const s = JSON.stringify(input, (k, v) => (v && typeof v === 'object' ? Object.keys(v).sort().reduce((a, kk) => { a[kk] = v[kk]; return a; }, {}) : v));
      return name + '::' + s;
    } catch { return name + '::' + String(input); }
  }

  /** Har layer ka scorecard — kitna kaam bacha */
  stats() {
    const s = this.statsData;
    const saved = s.requests - s.computed;
    return {
      ...s,
      savedWork: saved,
      savedPct: s.requests ? Math.round((saved / s.requests) * 100) : 0,
    };
  }

  reset() {
    this.cache.clear();
    this.statsData = { requests: 0, cacheHits: 0, dedupMerges: 0, batched: 0, queued: 0, computed: 0, errors: 0 };
  }
}

module.exports = { Parat };
