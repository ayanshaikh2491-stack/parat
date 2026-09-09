# 🧅 Parat — work-minimizing layers

**1000 requests → 10 compute.** Server ko kaam kam karo — load khud sahi ho jata hai.

> *parat* (परत) = layer. Har layer ka ek hi kaam: **neeche tak pahunchne wala kaam kam karna.**

## Problem

```
Bina parat:  1000 requests → 1000 baar asli kaam → server thak gaya 💀
Parat ke saath: 1000 requests →
   L1 cache ne 700 kha liye (jawab pehle se saved)
   L2 dedup ne 150 kha liye (same request chal rahi thi — share)
   L3 batch ne 90 ko 9 mein joda (ek call mein saare)
   L4 queue ne peak sambhala (cap ke andar smooth)
   → sirf 10 asli compute pahunche 🎯
```

## Install

```bash
git clone https://github.com/ayanshaikh2491-stack/parat.git
cd parat
npm link
```

## Use (3 lines)

```js
const { Parat } = require('parat');
const p = new Parat();

// sirf apna ASLI kaam likho — layers khud lag jati hain
p.task('report', async (input) => {
  return badaComputation(input);   // mehenga kaam
}, {
  cacheTtl: 3600_000,   // L1: 1 ghante same jawab = free
  dedup: true,          // L2: same request dobara mat chalao
  batch: { maxSize: 10, windowMs: 50 },  // L3: 10 chhote → 1 call (batch mode)
  concurrency: 5,       // L4: peak pe max 5 ek saath
});

const result = await p.run('report', { n: 42 });
console.log(p.stats());  // kitna kaam bacha — live proof
```

## CLI

```bash
parat demo    # 1000 requests → 10 compute LIVE proof
parat stats   # chhota demo + scorecard
```

## Layers

| Layer | Naam | Kya kha jata hai | Option |
|---|---|---|---|
| L1 | 🗄️ Cache | Same request ka saved jawab | `cacheTtl: ms` |
| L2 | 👯 Dedup | Abhi chal rahi same request | `dedup: true` (default) |
| L3 | 📦 Batch | Chhote same-type ek saath | `batch: {maxSize, windowMs}` |
| L4 | ⏳ Queue | Peak overload — line + cap | `concurrency: N` |
| L5 | ⚙️ Task | Asli kaam (sirf minimum yahan) | — |

Batch mode: `fn(inputs[]) => results[]` likho, Parat window bhar ke ek hi call karega.

## Tests — 20/20

```bash
npm test
```

**Theek hai test:**
- **1000 requests, 10 inputs → 10 compute (99% kaam bacha)** ✅
- 100 requests, batch 10 → **sirf 10 batch calls** ✅
- 500 ek saath (peak) → concurrency kabhi 5 se upar nahi gayi ✅
- Ek job fail → baaki jobs zinda (isolated) ✅
- Cache TTL expire, dedup ek hi starter, queue cap — sab unit tested ✅

```
🧅 PROOF: 1000 requests → 10 compute (kaam 99% bacha)
```

## Zero dependencies

Node stdlib only. ~250 lines total. Koi framework nahi, koi bloat nahi.

## License

MIT
