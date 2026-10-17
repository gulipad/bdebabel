// Page writer for the integer engine: babel-exp-1's sampling rules (repetition penalty, loop breaker, min-p) in
// integer arithmetic over the engine's Q12 logits, drawn from a seeded generator. Demo of speed and quality;
// the address codec (rANS over these integer weights) is the next step.
const P2 = Array.from({ length: 64 }, (_, k) => 2 ** k);
const rdiv = (a, b) => Math.floor((2 * a + b) / (2 * b));

export function xorshift(seedStr) {
  let h = 2166136261 >>> 0;
  for (const c of seedStr) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  let s = h || 1;
  const u32 = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; };
  return () => (u32() * 2 ** 21) + (u32() >>> 11);  // 53-bit integer
}

export function makeVocab(v) {
  const bytes = v.bytes.map((h) => { const b = new Uint8Array(h.length / 2); for (let i = 0; i < b.length; i++) b[i] = parseInt(h.substr(2 * i, 2), 16); return b; });
  const text = bytes.map((b) => new TextDecoder("utf-8", { fatal: false }).decode(b));
  const long = text.map((t) => t.trim().length > 3);
  return { bytes, text, long, eos: v.eos, r2l: v.r2l };
}

export function* writePage(engine, vocab, exp2, seed, { chars = 3200, penalty = [13, 10], window = 128, loopBias = 4, minP = 0.02 } = {}) {
  const rand = xorshift(seed), hist = [], dec = new TextDecoder("utf-8");
  const minpQ12 = Math.round(Math.log(1 / minP) * 4096);
  engine.reset();
  let tok = vocab.eos, written = 0, text = "";
  while (written < chars) {
    const z = Float64Array.from(engine.step(tok));
    z[vocab.eos] = -Infinity; z[vocab.r2l] = -Infinity;  // pages are full length; never write the direction tag
    const recent = new Set(hist.slice(-window));
    for (const t of recent) if (vocab.long[t]) z[t] = z[t] > 0 ? rdiv(z[t] * penalty[1], penalty[0]) : rdiv(z[t] * penalty[0], penalty[1]);
    for (let p = 1; p <= 8; p++) {  // loop breaker
      const reps = p <= 3 ? 4 : 3, n = reps * p;
      if (hist.length < n) continue;
      let loop = true;
      for (let i = hist.length - n; i < hist.length; i++) if (hist[i] !== hist[hist.length - p + ((i - (hist.length - n)) % p)]) { loop = false; break; }
      if (loop) { z[hist[hist.length - p]] -= loopBias * 4096; break; }
    }
    let zmax = -Infinity; for (let i = 0; i < z.length; i++) if (z[i] > zmax) zmax = z[i];
    const w = new Float64Array(z.length); let tot = 0;
    for (let i = 0; i < z.length; i++) {
      const d = zmax - z[i];
      if (!(d <= minpQ12)) continue;                           // min-p: within ln(1/minP) nats of the best
      const u = Math.floor((d * 5909 + 8192) / 16384);         // nats Q12 -> log2 Q10: d·log2(e)/4 (5909 = log2(e)·4096)
      const sh = Math.floor(u / 1024);
      const e = sh >= 21 ? 0 : Math.floor(exp2[u % 1024] / P2[sh]);
      w[i] = e; tot += e;
    }
    let r = rand() % tot, k = 0;
    while (r >= w[k]) { r -= w[k]; k++; }
    hist.push(k); tok = k;
    const piece = dec.decode(vocab.bytes[k], { stream: true });
    text += piece; written = text.length;
    yield { token: k, piece, text };
  }
}
