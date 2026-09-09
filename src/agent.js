/**
 * agent.js — PARAT AGENT: ek saath 1000+ kaam.
 *
 * Kaise? Agent ke paas SKILLS hote hain (chhote kaam).
 * Tum ek saath jobs ki LIST dete ho (1000+, kuch duplicate, kuch naye) —
 * agent sab ko EK SAATH chala deta hai, par layers kaam rakhte hain sane:
 *
 *   L1 cache  → job pehle ho chuka? result free
 *   L2 dedup  → 500 log same kaam maange? EK hi chale
 *   L3 batch  → chhote jodon ko ek call mein
 *   L4 queue  → 1500 ek saath aaye? cap ke andar line-smooth
 *
 * Result: sabko jawab milta hai, par asli compute SIRF unique kaam.
 */

const { Parat } = require('./parat.js');

class Agent {
  constructor(opts = {}) {
    this.p = new Parat();
    this.name = opts.name || 'parat-agent';
  }

  /** Skill register — chhota kaam (L5 compute) */
  skill(name, fn, opts = {}) {
    this.p.task('agent::' + name, fn, {
      cacheTtl: opts.cacheTtl || 60000,   // default: 1 min same result free
      dedup: opts.dedup !== false,
      batch: opts.batch || null,
      concurrency: opts.concurrency || 5,
    });
    return this;
  }

  /**
   * Ek saath SAB jobs chalao.
   * @param {Array} jobs — [{ task: 'skill-name', input: {...} }, ...]
   * @returns {Promise<{results, stats, breakdown, wallMs}>}
   */
  async run(jobs) {
    const t0 = Date.now();
    const results = await Promise.all(
      jobs.map((j) => this.p.run('agent::' + j.task, j.input))
    );
    const wallMs = Date.now() - t0;

    // per-task breakdown
    const breakdown = {};
    for (const j of jobs) {
      const k = j.task;
      breakdown[k] = breakdown[k] || { jobs: 0 };
      breakdown[k].jobs++;
    }
    for (const k of Object.keys(breakdown)) {
      breakdown[k].unique = new Set(
        jobs.filter((j) => j.task === k).map((j) => this.p.keyOf('agent::' + k, j.input))
      ).size;
    }

    return { results, stats: this.p.stats(), breakdown, wallMs };
  }

  /** Agent ka report — kya bacha, kitna time */
  report(out) {
    const s = out.stats;
    const lines = [
      `🤖 ${this.name} — ${s.requests} jobs ek saath`,
      `   wall time:    ${out.wallMs}ms`,
      `   asli compute: ${s.computed}  (unique kaam hi chala)`,
      `   kaam bacha:   ${s.savedPct}%`,
      `   L1 cache:     ${s.cacheHits} free jawab`,
      `   L4 queue:     ${s.queued} jobs cap ke andar chale`,
    ];
    for (const [task, b] of Object.entries(out.breakdown)) {
      lines.push(`   • ${task}: ${b.jobs} jobs → ${b.unique} unique`);
    }
    return lines.join('\n');
  }
}

module.exports = { Agent };
