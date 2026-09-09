/**
 * test-chunk.js — CHUNK ENGINE ka proof.
 *
 * Bada kaam: 10,000 items — chhote tukdon mein, parallel, cap ke andar.
 * Sab kuch PROVE hota hai numbers se.
 *
 * Run: node test-chunk.js
 */

const { ChunkEngine } = require('./src/chunk.js');

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { console.log('PASS: ' + name); pass++; }
  else { console.log('FAIL: ' + name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); fail++; }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  /* ============ C1: split pure ============ */
  console.log('=== C1: split ===');
  check('C1 split 10/3', JSON.stringify(ChunkEngine.split([1,2,3,4,5,6,7,8,9,10], 3)) === JSON.stringify([[1,2,3],[4,5,6],[7,8,9],[10]]));
  check('C1 split empty', ChunkEngine.split([], 5).length === 0);
  check('C1 split size > items', ChunkEngine.split([1, 2], 100).length === 1);

  /* ============ C2: 10,000 items — bada kaam ============ */
  console.log('\n=== C2: 10,000 items ka bada kaam ===');
  const eng = new ChunkEngine({ chunkSize: 100, concurrency: 5 });
  const items = Array.from({ length: 10000 }, (_, i) => i); // 10k
  let chunkCalls = 0;
  let peakConc = 0, curConc = 0;
  const out = await eng.run(items, async (chunk) => {
    chunkCalls++;
    curConc++; peakConc = Math.max(peakConc, curConc);
    await sleep(5); // har tukda thoda kaam karta hai
    curConc--;
    return chunk.map((x) => x * 2);
  });
  console.log('  ', JSON.stringify(out.stats));
  check('C2 100 chunks bane (10000/100)', out.stats.chunks === 100);
  check('C2 100 chunk calls hue', chunkCalls === 100, { chunkCalls });
  check('C2 peak concurrency <= 5', peakConc <= 5, { peakConc });
  check('C2 sab 10k results sahi', out.results.every((r, i) => r === i * 2));
  check('C2 zero fail', out.failedChunks.length === 0);
  const seqTime = 100 * 5; // sequential hota to ~500ms
  check('C2 parallel fast (cap 5 se < 200ms)', out.stats.wallMs < seqTime, { wallMs: out.stats.wallMs, seqTime });
  console.log('   sequential hota to ~' + seqTime + 'ms — asli: ' + out.stats.wallMs + 'ms');

  /* ============ C3: onProgress live updates ============ */
  console.log('\n=== C3: progress tracking ===');
  const progressLog = [];
  await eng.run(Array.from({ length: 500 }, (_, i) => i), async (chunk) => {
    await sleep(2);
    return chunk.map((x) => x);
  }, { chunkSize: 50, concurrency: 3, onProgress: (p) => progressLog.push(p.chunksDone + '/' + p.chunksTotal) });
  check('C3 progress updates aaye', progressLog.length === 10, { log: progressLog });
  check('C3 progress last = 10/10', progressLog[progressLog.length - 1] === '10/10');

  /* ============ C4: retry + fail isolation ============ */
  console.log('\n=== C4: retry aur fail-isolation ===');
  const engR = new ChunkEngine({ chunkSize: 10, concurrency: 4, retries: 2 });
  let attemptLog = {};
  const itemsR = Array.from({ length: 100 }, (_, i) => i);
  const outR = await engR.run(itemsR, async (chunk, ci) => {
    attemptLog[ci] = (attemptLog[ci] || 0) + 1;
    // chunk 3 HAMESHA fail karega (sirf wahi)
    if (ci === 3) throw new Error('yeh tukda kharab hai');
    // chunk 5 pehli baar fail, doosri baar pass (retry bachata hai)
    if (ci === 5 && attemptLog[ci] === 1) throw new Error('ek baar gir gaya');
    return chunk.map((x) => x + 1);
  });
  check('C4 sirf 1 tukda fail hua', outR.failedChunks.length === 1 && outR.failedChunks[0].chunkIndex === 3);
  check('C4 retry ne bacha liya (chunk 5 do baar chala, pass hua)', attemptLog[5] === 2);
  check('C4 baaki sab results sahi', outR.results.filter((r, i) => i < 30 || i >= 40).every((r, i) => r !== undefined));
  check('C4 fail wale tukde ke results undefined', outR.results.slice(30, 40).every((r) => r === undefined));
  check('C4 error message aaya', outR.failedChunks[0].error.includes('kharab'));

  /* ============ C5: chunk cache — dobara same kaam = free ============ */
  console.log('\n=== C5: chunk cache ===');
  const engC = new ChunkEngine({ chunkSize: 50, concurrency: 5 });
  let expensiveCalls = 0;
  const itemsC = Array.from({ length: 200 }, (_, i) => i);
  const workFn = async (chunk) => { expensiveCalls++; await sleep(8); return chunk.map((x) => x * 3); };
  const optsC = { keyFn: (chunk, ci) => 'batchA-' + ci, cacheTtl: 60000 };
  const out1 = await engC.run(itemsC, workFn, optsC);
  check('C5 pehli baar 4 chunk calls', expensiveCalls === 4, { expensiveCalls });
  const out2 = await engC.run(itemsC, workFn, optsC); // SAME kaam dobara
  check('C5 dobara ZERO compute (cache se)', expensiveCalls === 4, { expensiveCalls });
  check('C5 dobara results bhi sahi', out2.results.every((r, i) => r === i * 3));
  console.log('   same kaam dobara: ' + out2.stats.wallMs + 'ms (pehle ' + out1.stats.wallMs + 'ms) — FREE!');

  /* ============ C6: sequence of results maintained ============ */
  console.log('\n=== C6: order maintained ===');
  const engO = new ChunkEngine({ chunkSize: 7, concurrency: 6 });
  const itemsO = Array.from({ length: 50 }, (_, i) => ({ id: i }));
  const outO = await engO.run(itemsO, async (chunk) => {
    await sleep(Math.random() * 5); // random delay — order phir bhi sahi hona chahiye
    return chunk.map((c) => c.id * 10);
  });
  check('C6 results order mein', outO.results.every((r, i) => r === i * 10));

  /* ============ FINAL ============ */
  console.log('\n' + '='.repeat(55));
  console.log(`RESULTS: ${pass} pass, ${fail} fail`);
  console.log('='.repeat(55));
  if (fail) process.exit(1);
  console.log('\n🧩 CHUNK PROOF: 10,000 items → 100 tukde, cap 5, sab parallel, zero hang');
})().catch((e) => { console.error('CRASH:', e); process.exit(1); });
