/**
 * chunk.js — CHUNK ENGINE: bada kaam → chhote tukde → parallel → jod do.
 *
 * Ye tere OS ka "bade kaam free mein" wala hissa hai:
 *   - 10,000 items ka kaam? 100 tukde (100 items each) banao
 *   - Har tukda CHHOTA hai — chhote server (free tier) ke RAM limit ke ANDAR
 *   - Tukde PARALLEL chalte hain — par concurrency cap ke andar (hang-proof)
 *   - Ek tukda fail ho to RETRY, phir bhi fail to sirf WOH fail — baqi zinda
 *   - Optional: tukde ka result CACHE (dubara same kaam = free)
 *
 * Kaam ka proof: 20 tukde x 10ms sequential = 200ms
 *               parallel (cap 5) = ~50ms  → 4x tez, CPU kabhi overwhelm nahi
 */

const { Queue } = require('./queue.js');
const { Cache } = require('./cache.js');

class ChunkEngine {
  /**
   * @param {object} opts
   * @param {number} opts.chunkSize — ek tukde mein kitne items (default 100)
   * @param {number} opts.concurrency — max kitne tukde ek saath (default 5)
   * @param {number} opts.retries — fail hone pe kitni baar dobara (default 0)
   */
  constructor(opts = {}) {
    this.defaultSize = opts.chunkSize || 100;
    this.concurrency = opts.concurrency || 5;
    this.retries = opts.retries || 0;
    this.cache = new Cache(); // tukde-level cache (keyFn diya to)
  }

  /** Pure split: [1..10] size 3 → [[1,2,3],[4,5,6],[7,8,9],[10]] */
  static split(items, size) {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
    return chunks;
  }

  /**
   * Bada kaam chalao.
   * @param {Array} items — poora kaam (kai bhi items)
   * @param {Function} chunkFn — async (chunk, chunkIndex) => results[] (same length!)
   * @param {object} opts — { chunkSize, concurrency, retries, keyFn, cacheTtl, onProgress }
   * @returns { results[], failedChunks[], stats }
   */
  async run(items, chunkFn, opts = {}) {
    const t0 = Date.now();
    if (!Array.isArray(items)) throw new Error('items array hona chahiye');
    const size = Math.max(1, opts.chunkSize || this.defaultSize);
    const concurrency = Math.max(1, opts.concurrency || this.concurrency);
    const retries = opts.retries !== undefined ? opts.retries : this.retries;
    const onProgress = opts.onProgress || null;
    const keyFn = opts.keyFn || null;
    const cacheTtl = opts.cacheTtl || 0;

    const chunks = ChunkEngine.split(items, size);
    const results = new Array(items.length);
    const failedChunks = [];
    let chunksDone = 0, itemsDone = 0;
    let peakConc = 0, curConc = 0, retryCount = 0;

    const jobs = chunks.map((chunk, ci) => {
      const start = ci * size;
      return async () => {
        // L1 — chunk cache (same tukda pehle ho chuka?)
        const cacheKey = keyFn ? keyFn(chunk, ci) : null;
        if (cacheKey) {
          const hit = this.cache.get(cacheKey);
          if (hit !== undefined) {
            hit.forEach((v, i) => { results[start + i] = v; });
            return;
          }
        }
        // retry loop
        let attempt = 0;
        while (true) {
          try {
            curConc++; peakConc = Math.max(peakConc, curConc);
            const out = await chunkFn(chunk, ci);
            curConc--;
            if (!Array.isArray(out) || out.length !== chunk.length) {
              throw new Error('chunkFn ko same-length array wapas karni hai (chunk ' + ci + ')');
            }
            out.forEach((v, i) => { results[start + i] = v; });
            if (cacheKey && cacheTtl) this.cache.set(cacheKey, out, cacheTtl);
            return;
          } catch (e) {
            curConc--;
            if (attempt < retries) { attempt++; retryCount++; continue; }
            failedChunks.push({ chunkIndex: ci, error: String(e && e.message || e) });
            return; // sirf YE tukda fail — baqi chalte rahenge
          }
        }
      };
    });

    // sab tukde queue mein — cap ke andar smooth
    const q = new Queue({ concurrency });
    await Promise.all(
      jobs.map((j, ci) =>
        q.submit(j).then(() => {
          chunksDone++;
          itemsDone = Math.min(items.length, itemsDone + chunks[ci].length);
          if (onProgress) onProgress({ chunksDone, chunksTotal: chunks.length, itemsDone, itemsTotal: items.length });
        })
      )
    );

    return {
      results,
      failedChunks,
      stats: {
        items: items.length,
        chunks: chunks.length,
        chunkSize: size,
        peakConcurrency: peakConc,
        retries: retryCount,
        failed: failedChunks.length,
        wallMs: Date.now() - t0,
      },
    };
  }

  /** cache saaf (naye kaam ke liye) */
  clearCache() { this.cache.clear(); }
}

module.exports = { ChunkEngine };
