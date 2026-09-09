#!/usr/bin/env node
/**
 * parat — CLI
 *
 *   parat demo    → live proof: 1000 requests, sirf 10 compute
 *   parat stats   → layer scorecard example
 *   parat help
 */

const { Parat } = require('../src/parat.js');

const HELP = `parat — work-minimizing layers (परत)

  parat demo    1000 requests → 10 compute ka LIVE proof
  parat stats   ek chhota demo + layer scorecard
  parat help    ye help

Library:
  const { Parat } = require('parat');
  p.task('naam', fn, { cacheTtl, dedup, batch: {maxSize,windowMs}, concurrency });
  await p.run('naam', input);
  p.stats(); // { requests, computed, savedPct }`;

async function demo() {
  const p = new Parat();
  let compute = 0;
  p.task('report', async (input) => {
    compute++;
    await new Promise((r) => setTimeout(r, 5));
    return { value: input.n * 2 };
  }, { cacheTtl: 10000 });

  console.log('1000 requests bhej rahe hain (10 alag inputs)...');
  const reqs = [];
  for (let i = 0; i < 1000; i++) reqs.push(p.run('report', { n: i % 10 }));
  await Promise.all(reqs);

  const s = p.stats();
  console.log(`
🧅 PARAT LAYERS — RESULT
  requests aaye:   ${s.requests}
  asli compute:    ${s.computed}  ← SIRF ITNA!
  kaam bacha:      ${s.savedPct}%
  
  L1 cache:   ${s.cacheHits} requests ka jawab seedha mila (compute 0)
  L2 dedup:   chal rahi requests share hui
  L4 queue:   ${s.queued} kaam cap ke andar smooth chale`);
}

async function statsDemo() {
  const p = new Parat();
  let calls = 0;
  p.task('quick', async (x) => { calls++; return x + 1; }, { cacheTtl: 5000 });
  await Promise.all([p.run('quick', 1), p.run('quick', 1), p.run('quick', 1), p.run('quick', 2)]);
  console.log('4 requests, asli calls:', calls);
  console.log(JSON.stringify(p.stats(), null, 2));
}

const cmd = process.argv[2] || 'help';
if (cmd === 'demo') demo().catch((e) => { console.error(e); process.exit(1); });
else if (cmd === 'stats') statsDemo().catch((e) => { console.error(e); process.exit(1); });
else console.log(HELP);
