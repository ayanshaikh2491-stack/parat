/**
 * test-parat.js — PARAT layer-system proof.
 *
 * ASLI TEST: 1000 requests daalo, count karo kitni baar ASLI compute chala.
 * Layers ne kaam bacha? Numbers prove karenge.
 *
 * Run: node test-parat.js
 */

const { Cache } = require('./src/cache.js');
const { Dedup } = require('./src/dedup.js');
const { Batcher } = require('./src/batch.js');
const { Queue } = require('./src/queue.js');
const { Parat } = require('./src/parat.js');

let pass = 0, fail = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, cond, detail) => {
  if (cond) { console.log('PASS: ' + name); pass++; }
  else { console.log('FAIL: ' + name + (detail ? ' — ' + JSON.stringify(detail) : '')); fail++; }
};

(async () => {
  /* ============ L1: CACHE ============ */
  console.log('=== L1: cache ===');
  const c = new Cache();
  c.set('a', 1);
  check('cache get hit', c.get('a') === 1);
  check('cache miss undefined', c.get('b') === undefined);
  c.set('t', 'v', 30); // 30ms ttl
  await sleep(50);
  check('cache ttl expire', c.get('t') === undefined);
  c.set('k', 'x', 1000);
  c.delete('k');
  check('cache delete', c.get('k') === undefined);

  /* ============ L2: DEDUP ============ */
  console.log('\n=== L2: dedup ===');
  const d = new Dedup();
  let starts = 0;
  const slow = () => { starts++; return sleep(30).then(() => 'done'); };
  const [r1, r2, r3] = await Promise.all([d.run('same', slow), d.run('same', slow), d.run('same', slow)]);
  check('dedup same result', r1 === r2 && r2 === r3 && r1 === 'done');
  check('dedup starter ran ONCE', starts === 1, { starts });
  check('dedup cleared after settle', d.size === 0);

  /* ============ L3: BATCH ============ */
  console.log('\n=== L3: batch ===');
  const b = new Batcher({ maxSize: 5, windowMs: 40 });
  let batchCalls = 0;
  b.onBatch(async (items) => { batchCalls++; return items.map((x) => x * 10); });
  const proms = [1, 2, 3, 4].map((n) => b.add(n)); // 4 items, ek window
  const results = await Promise.all(proms);
  check('batch results sahi', JSON.stringify(results) === JSON.stringify([10, 20, 30, 40]));
  check('batch ek hi call hua', batchCalls === 1, { batchCalls });
  // maxSize flush
  const b2 = new Batcher({ maxSize: 3, windowMs: 500 });
  let b2calls = 0;
  b2.onBatch(async (items) => { b2calls++; return items; });
  const p2 = [1, 2, 3].map((n) => b2.add(n)); // 3 = maxSize → turant flush
  await Promise.all(p2);
  check('batch maxSize flush', b2calls === 1);

  /* ============ L4: QUEUE ============ */
  console.log('\n=== L4: queue ===');
  const q = new Queue({ concurrency: 2 });
  let maxConcurrent = 0, nowRunning = 0;
  const job = async () => {
    nowRunning++; maxConcurrent = Math.max(maxConcurrent, nowRunning);
    await sleep(30);
    nowRunning--;
    return 'ok';
  };
  await Promise.all([1, 2, 3, 4, 5, 6].map(() => q.submit(job)));
  check('queue sab complete', q.active === 0 && q.size === 0);
  check('queue concurrency cap 2', maxConcurrent === 2, { maxConcurrent });
  // ek fail ho to baaki aage
  const q2 = new Queue({ concurrency: 1 });
  const bad = q2.submit(async () => { throw new Error('boom'); });
  const good = q2.submit(async () => 'survived');
  let badErr = null;
  await bad.catch((e) => { badErr = e.message; });
  const g = await good;
  check('queue fail isolated', badErr === 'boom' && g === 'survived');

  /* ============ L5: FULL PIPELINE — ASLI PROOF ============ */
  console.log('\n=== L5: pipeline — 1000 requests wala test ===');
  const p = new Parat();

  // mehenga task — har call count hoti hai
  let expensiveCalls = 0;
  p.task('report', async (input) => {
    expensiveCalls++;
    await sleep(5);
    return { value: input.n * 2 };
  }, { cacheTtl: 10000 });

  // SCENARIO: 1000 requests — 10 alag inputs, 100 baar har ek
  const reqs = [];
  for (let i = 0; i < 1000; i++) {
    reqs.push(p.run('report', { n: i % 10 }));
  }
  await Promise.all(reqs);
  const st = p.stats();
  console.log('  requests:', st.requests, '| computed:', st.computed, '| saved:', st.savedPct + '%');
  check('1000 requests aaye', st.requests === 1000);
  check('sirf 10 compute chale (cache+dedup ne 990 bachaye)', expensiveCalls === 10, { expensiveCalls, computed: st.computed });
  check('stats sahi', st.savedPct === 99);

  // SCENARIO 2 — batch task: 100 requests → 10 batch calls
  console.log('\n=== L5b: batch task — 100 → kuch hi compute ===');
  const pB = new Parat();
  let batchCompute = 0;
  pB.task('double', async (inputs) => {
    batchCompute++;
    await sleep(10);
    return inputs.map((x) => ({ value: x * 2 }));
  }, { batch: { maxSize: 10, windowMs: 30 }, concurrency: 2 });
  const reqs2 = [];
  for (let i = 0; i < 100; i++) reqs2.push(pB.run('double', i));
  const res2 = await Promise.all(reqs2);
  check('batch sab results sahi', res2.every((r, i) => r.value === i * 2));
  console.log('  100 requests | batch compute calls:', batchCompute);
  check('100 requests sirf ~10 compute (batch size 10)', batchCompute <= 12 && batchCompute >= 9, { batchCompute });

  // SCENARIO 3 — peak load: 500 ek saath, queue cap 5
  console.log('\n=== L5c: peak load — 500 ek saath, cap 5 ===');
  const p3 = new Parat();
  p3.task('tick', async (x) => { await sleep(3); return x; }, { concurrency: 5 });
  let peakConc = 0, cur = 0;
  const origFn = p3.tasks.get('tick').fn;
  p3.tasks.get('tick').fn = async (x) => {
    cur++; peakConc = Math.max(peakConc, cur);
    const v = await origFn(x);
    cur--;
    return v;
  };
  const reqs3 = [];
  for (let i = 0; i < 500; i++) reqs3.push(p3.run('tick', i)); // 500 alag inputs — cache/dedup kuch nahi bachayega
  await Promise.all(reqs3);
  console.log('  500 requests | peak concurrent:', peakConc, '(cap 5 ke andar)');
  check('peak load sab complete', reqs3.length === 500);
  check('queue cap respected (kabhi 6+ nahi chale)', peakConc <= 5, { peakConc });

  /* ============ FINAL ============ */
  console.log('\n' + '='.repeat(50));
  console.log(`RESULTS: ${pass} pass, ${fail} fail`);
  console.log('='.repeat(50));
  if (fail) process.exit(1);
  console.log('ALL PARAT LAYER TESTS PASSED');
  console.log('\n🧅 PROOF: 1000 requests → ' + expensiveCalls + ' compute (kaam 99% bacha)');
})();
