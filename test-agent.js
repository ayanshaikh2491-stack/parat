/**
 * test-agent.js — PARAT AGENT ka asli test.
 *
 * SCENARIO (jaise user ne bola): ek saath 1000+ kaam.
 *   - 1500 jobs total (3 skills: fetch-page, transform, summarize)
 *   - Andar duplicates BHI hain (jaise real agents ke paas hota hai)
 *   - Har compute mehenga (sleep) — taaki bachat DIKHE
 *   - Assert: sab jobs ka result sahi, compute == unique, cap respected
 *
 * Run: node test-agent.js
 */

const { Agent } = require('./src/agent.js');

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { console.log('PASS: ' + name); pass++; }
  else { console.log('FAIL: ' + name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); fail++; }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  /* ========== T1: 1500 jobs ek saath ========== */
  console.log('=== T1: 1500 jobs, 3 skills, duplicates ke saath ===');
  const agent = new Agent({ name: 'bulk-worker' });

  let fetchCalls = 0, transformCalls = 0, summarizeCalls = 0;
  let peakConc = 0, curConc = 0;

  // Skill 1: page fetch — mehenga (network jaisa)
  agent.skill('fetch-page', async (url) => {
    fetchCalls++;
    curConc++; peakConc = Math.max(peakConc, curConc);
    await sleep(8); // network feel
    curConc--;
    return { url, title: 'Title of ' + url, len: url.length * 10 };
  }, { concurrency: 8 });

  // Skill 2: transform — medium cost
  agent.skill('transform', async (data) => {
    transformCalls++;
    await sleep(4);
    return { out: String(data).toUpperCase() };
  }, { concurrency: 5 });

  // Skill 3: summarize — sasta
  agent.skill('summarize', async (text) => {
    summarizeCalls++;
    await sleep(2);
    return { summary: text.slice(0, 5) + '...' };
  }, { concurrency: 3 });

  // 1500 jobs banao — real jaisa mix + duplicates
  const jobs = [];
  for (let i = 0; i < 500; i++) {
    jobs.push({ task: 'fetch-page', input: 'https://example.com/page-' + (i % 50) }); // 50 unique, 500 jobs → dup 10x
  }
  for (let i = 0; i < 600; i++) {
    jobs.push({ task: 'transform', input: 'data-' + (i % 120) }); // 120 unique, 600 jobs → dup 5x
  }
  for (let i = 0; i < 400; i++) {
    jobs.push({ task: 'summarize', input: 'text-' + (i % 80) }); // 80 unique, 400 jobs → dup 5x
  }
  // 500+600+400 = 1500 jobs

  const out = await agent.run(jobs);
  console.log(agent.report(out));

  check('T1 1500 jobs complete hue', out.results.length === 1500);
  check('T1 fetch compute == unique (50)', fetchCalls === 50, { fetchCalls });
  check('T1 transform compute == unique (120)', transformCalls === 120, { transformCalls });
  check('T1 summarize compute == unique (80)', summarizeCalls === 80, { summarizeCalls });
  check('T1 total compute == 250 unique', out.stats.computed === 250, { computed: out.stats.computed });
  const expectSaved = Math.round(((1500 - 250) / 1500) * 100);
  check('T1 kaam bacha ~83%', out.stats.savedPct === expectSaved, { savedPct: out.stats.savedPct, expectSaved });
  check('T1 fetch cap respected (8)', peakConc <= 8, { peakConc });

  // results sahi hain? spot-check karo
  const fetch0 = out.results[0];
  check('T1 result shape sahi', fetch0.url === 'https://example.com/page-0' && fetch0.title.includes('page-0'));
  const t500 = out.results[500];
  check('T1 transform result sahi', t500.out === ('data-' + (0 % 120)).toUpperCase());
  const s1100 = out.results[1100];
  check('T1 summarize result sahi', s1100.summary === ('text-' + (0 % 80)).slice(0, 5) + '...');

  /* ========== T2: 3000 jobs — pehle se zyada ========== */
  console.log('\n=== T2: 3000 jobs (aur bada blast) ===');
  const agent2 = new Agent({ name: 'mega-worker' });
  let calls2 = 0;
  agent2.skill('hash', async (n) => { calls2++; await sleep(3); return { h: n * 31 }; }, { concurrency: 10 });
  const jobs2 = [];
  for (let i = 0; i < 3000; i++) jobs2.push({ task: 'hash', input: i % 100 }); // 100 unique, 3000 jobs
  const out2 = await agent2.run(jobs2);
  console.log(agent2.report(out2));
  check('T2 3000 jobs complete', out2.results.length === 3000);
  check('T2 compute == 100 unique', calls2 === 100, { calls2 });
  check('T2 sab results sahi', out2.results.every((r, i) => r.h === (i % 100) * 31));
  check('T2 saved 97%', out2.stats.savedPct === 97, { savedPct: out2.stats.savedPct });

  /* ========== T3: fail wali jobs — doosre zinda rahein ========== */
  console.log('\n=== T3: ek skill fail ho to? ===');
  const agent3 = new Agent({ name: 'resilient' });
  agent3.skill('ok', async (n) => ({ n }));
  agent3.skill('bad', async (n) => { if (n === 3) throw new Error('kaboom'); return { n }; }, { dedup: false, cacheTtl: 0 });
  const jobs3 = [
    { task: 'ok', input: 1 }, { task: 'ok', input: 1 },
    { task: 'bad', input: 2 }, { task: 'bad', input: 3 }, { task: 'bad', input: 4 },
    { task: 'ok', input: 2 },
  ];
  let failedCount = 0;
  const out3 = await new Promise((resolve) => {
    const results = [];
    let done = 0;
    for (const j of jobs3) {
      agent3.p.run('agent::' + j.task, j.input)
        .then((r) => { results.push({ ok: true, r }); })
        .catch((e) => { results.push({ ok: false, e: e.message }); failedCount++; })
        .finally(() => { if (++done === jobs3.length) resolve({ results }); });
    }
  });
  check('T3 sirf 1 fail hua', failedCount === 1, { failedCount });
  check('T3 baaki 5 zinda', out3.results.length === 6 && out3.results.filter((r) => r.ok).length === 5);
  check('T3 fail ka msg', out3.results.find((r) => !r.ok).e === 'kaboom');

  /* ========== FINAL ========== */
  console.log('\n' + '='.repeat(55));
  console.log(`RESULTS: ${pass} pass, ${fail} fail`);
  console.log('='.repeat(55));
  if (fail) process.exit(1);
  console.log('\n🤖 AGENT PROOF: 1500 jobs → 250 compute | 3000 jobs → 100 compute');
})().catch((e) => { console.error('TEST CRASH:', e); process.exit(1); });
