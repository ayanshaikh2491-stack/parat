/**
 * queue.js — LAYER 4 (QUEUE)
 *
 * Kaam: peak pe sab ek saath compute pe mat daalo — line lagao.
 * concurrency cap: max N kaam ek saath. Baaki line mein.
 * Ek fail ho to sirf wahi fail — line aage chalti hai.
 */

class Queue {
  constructor(opts = {}) {
    this.concurrency = opts.concurrency || 5;
    this.running = 0;
    this.waiting = []; // { fn, resolve, reject }
  }

  /** ek kaam submit karo — complete hone ka promise milega */
  submit(fn) {
    return new Promise((resolve, reject) => {
      this.waiting.push({ fn, resolve, reject });
      this.drain();
    });
  }

  /** jitni jagah hai utne kaam shuru karo */
  drain() {
    while (this.running < this.concurrency && this.waiting.length) {
      const job = this.waiting.shift();
      this.running++;
      Promise.resolve()
        .then(() => job.fn())
        .then(
          (v) => { this.running--; job.resolve(v); this.drain(); },
          (e) => { this.running--; job.reject(e); this.drain(); }
        );
    }
  }

  get size() { return this.waiting.length; }
  get active() { return this.running; }
}

module.exports = { Queue };
