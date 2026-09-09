/**
 * batch.js — LAYER 3 (BATCH)
 *
 * Kaam: chhote-chhote same-type requests ko thoda rok ke EK computation mein jodna.
 * windowMs mein jitne requests aayi, sab ek array → ek handler call.
 * 90 alag calls → 9 batched calls = kaam 10x kam.
 */

class Batcher {
  /**
   * @param {object} opts
   * @param {number} opts.maxSize — itne items ek saath max (window size cap)
   * @param {number} opts.windowMs — itne ms wait karke phir bhejo (chhote requests ke liye)
   */
  constructor(opts = {}) {
    this.maxSize = opts.maxSize || 10;
    this.windowMs = opts.windowMs || 50;
    this.queue = [];      // { item, resolve, reject }
    this.timer = null;
    this.handler = null;  // (items[]) => Promise<results[]>
  }

  /** handler set karo (batch run hone pe ye call hota hai) */
  onBatch(handler) { this.handler = handler; }

  /** ek item daalo — result ka promise wapas */
  add(item) {
    return new Promise((resolve, reject) => {
      this.queue.push({ item, resolve, reject });
      if (this.queue.length >= this.maxSize) this.flush();
      else if (!this.timer) this.timer = setTimeout(() => this.flush(), this.windowMs);
    });
  }

  /** abhi jo bana hai bhejo */
  async flush() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const batch = this.queue.splice(0, this.queue.length);
    if (!batch.length) return;
    const items = batch.map(b => b.item);
    try {
      const results = await this.handler(items);
      batch.forEach((b, i) => b.resolve(results[i]));
    } catch (e) {
      batch.forEach(b => b.reject(e));
    }
  }

  get pending() { return this.queue.length; }
}

module.exports = { Batcher };
