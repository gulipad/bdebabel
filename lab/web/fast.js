// Fast integer engine: same arithmetic as engine.js / lab/int_engine.py, with the heavy loops (matrix
// products, requantization, attention over the cache) in WebAssembly SIMD (engine.wasm). Results are
// identical to the reference by construction; test_fast.mjs checks them against golden logits.

const P2 = Array.from({ length: 64 }, (_, k) => 2 ** k);
const rshift = (x, k) => (k > 0 ? Math.floor((x + P2[k - 1]) / P2[k]) : x * P2[-k]);
const rdiv = (a, b) => Math.floor((2 * a + b) / (2 * b));
const isqrt = (n) => { let r = Math.floor(Math.sqrt(n)); if (r * r > n) r -= 1; if ((r + 1) * (r + 1) <= n) r += 1; return r; };
const bitlen = (x) => { if (x <= 0) return 0; if (x < 2 ** 31) return 32 - Math.clz32(x); let b = 31; while (P2[b] <= x) b++; return b; };

export async function fastEngine(modelBytes, index, wasmBytes) {
  const cfg = new Int32Array(modelBytes.buffer, modelBytes.byteOffset + index.cfg.offset, 7);
  const [vocab, layers, dim, heads, kvh, ffn, context] = Array.from(cfg);
  const hd = dim / heads, page = 65536;
  // memory: model | K,V caches (int16) | scratch
  let off = Math.ceil(modelBytes.length / 64) * 64;
  const kvBytes = context * kvh * hd * 2;
  const Koff = [], Voff = [];
  for (let L = 0; L < layers; L++) { Koff.push(off); off += kvBytes; Voff.push(off); off += kvBytes; }
  const A8 = off; off += 1 << 16;            // int8 activations
  const ACC = off; off += vocab * 4;         // int32 accumulators
  const OUT = off; off += vocab * 4;         // int32 requantized outputs
  const Q = off; off += 256;                 // int16 query (64)
  const SC = off; off += context * 4;        // int32 scores
  const EB = off; off += context * 4;        // int32 softmax weights
  const WS = off; off += 64 * 8;             // int64 weighted sums
  const memory = new WebAssembly.Memory({ initial: Math.ceil((off + 1024) / page) });
  const u8 = new Uint8Array(memory.buffer);
  u8.set(modelBytes, 0);
  const { instance } = await WebAssembly.instantiate(wasmBytes, { env: { mem: memory } });
  const X = instance.exports;
  const buf = memory.buffer;
  const view = (name) => { const e = index[name], n = e.shape.reduce((a, b) => a * b, 1); return e.dtype === "i8" ? new Int8Array(buf, e.offset, n) : new Int32Array(buf, e.offset, n); };
  const V = {}; const get = (n) => V[n] || (V[n] = view(n));
  const a8v = new Int8Array(buf, A8, 1 << 16), outv = new Int32Array(buf, OUT, vocab);
  const qv = new Int16Array(buf, Q, 128), scv = new Int32Array(buf, SC, context), ev = new Int32Array(buf, EB, context);
  const wsv = new BigInt64Array(buf, WS, 64);
  const Kv = Koff.map((o) => new Int16Array(buf, o, context * kvh * hd)), Vv = Voff.map((o) => new Int16Array(buf, o, context * kvh * hd));
  const exp2 = get("exp2"), sigT = get("sigmoid"), rc = get("rope_c"), rsn = get("rope_s");
  const sigmoid = (g) => sigT[Math.min(4095, Math.max(-4096, rshift(g, 8))) + 4096];

  function rms(x, n) {
    let amax = 0; for (let i = 0; i < n; i++) { const a = Math.abs(x[i]); if (a > amax) amax = a; }
    const sh = Math.max(bitlen(amax) - 20, 0), d = P2[sh];
    let ms = 0; for (let i = 0; i < n; i++) { const v = Math.floor(x[i] / d); ms += v * v; }
    return Math.max(isqrt(Math.floor(ms / n)), 1) * d;
  }
  function quant(x, n, denom) {  // writes int8 into WASM scratch; returns T
    let amax = 0; for (let i = 0; i < n; i++) { const a = Math.abs(x[i]); if (a > amax) amax = a; }
    if (amax === 0) { a8v.fill(0, 0, n); return 0; }
    for (let i = 0; i < n; i++) a8v[i] = rdiv(127 * x[i], amax);
    return rdiv(amax * P2[24], 127 * denom);
  }
  function linear(name, T, outBits = 16) {  // uses the int8 row already in scratch
    const e = index[name + ".w"], [rows, cols] = e.shape;
    X.matvec(e.offset, A8, ACC, rows, cols);
    if (T === 0) { outv.fill(0, 0, rows); return outv.subarray(0, rows); }
    X.requant(ACC, index[name + ".m"].offset, index[name + ".k"].offset, rows, BigInt(T), BigInt(24 + 16 - outBits), OUT);
    return outv.subarray(0, rows);
  }
  function pre(name) {  // acc * m >> k only (QK-norm cancels the token factor): rshift(P*2, 1) == P
    const e = index[name + ".w"], [rows, cols] = e.shape;
    X.matvec(e.offset, A8, ACC, rows, cols);
    X.requant(ACC, index[name + ".m"].offset, index[name + ".k"].offset, rows, 2n, 1n, OUT);
    return Float64Array.from(outv.subarray(0, rows));
  }
  function qk(P, p, n, nh, pos, dst, dstOff) {  // QK-norm, int8, RoPE -> int16 into dst at dstOff
    const m = get(p + n + "n.m"), k = get(p + n + "n.k"), half = hd / 2, base = pos * half, q = new Float64Array(hd);
    for (let h = 0; h < nh; h++) {
      const v = P.subarray(h * hd, (h + 1) * hd), r = rms(v, hd);
      let amax = 0; for (let i = 0; i < hd; i++) { const a = Math.abs(v[i]); if (a > amax) amax = a; }
      const sh = Math.max(bitlen(amax) - 22, 0), d = P2[sh], rr = Math.floor(r / d);
      for (let i = 0; i < hd; i++) q[i] = Math.min(127, Math.max(-127, rdiv(Math.floor(v[i] / d) * m[i], rr * P2[k[i]])));
      for (let i = 0; i < half; i++) {
        const c = rc[base + i], s = rsn[base + i], x1 = q[i], x2 = q[i + half];
        dst[dstOff + h * hd + i] = rshift(x1 * c - x2 * s, 14);
        dst[dstOff + h * hd + i + half] = rshift(x1 * s + x2 * c, 14);
      }
    }
  }

  const eng = {
    pos: 0, vocab, context,
    reset() { this.pos = 0; },
    step(token) {
      const pos = this.pos, half = layers / 2, em = get("embed.m"), ek = get("embed.k"), E = get("embed.w");
      const x = new Float64Array(dim), saved = [];
      for (let i = 0; i < dim; i++) x[i] = rshift(E[token * dim + i] * em[token], ek[token]);
      const o = new Float64Array(dim), hdn = new Float64Array(ffn), row = kvh * hd;
      for (let L = 0; L < layers; L++) {
        const p = `blocks.${L}.`;
        if (L >= layers - half) {
          const j = layers - 1 - L, sm = get("skip.m")[j], sk = get("skip.k")[j], s = saved[j];
          for (let i = 0; i < dim; i++) x[i] += rshift(s[i] * sm, sk);
        }
        let T = quant(x, dim, rms(x, dim));
        const Pq = pre(p + "q"), Pk = pre(p + "k");
        const vq = linear(p + "v", T), Kc = Kv[L], Vc = Vv[L];
        for (let i = 0; i < row; i++) Vc[pos * row + i] = Math.min(32767, Math.max(-32767, rshift(vq[i], 8)));
        const g = Float64Array.from(linear(p + "gate", T));
        qk(Pk, p, "k", kvh, pos, Kc, pos * row);
        const qbuf = new Float64Array(heads * hd);
        qk(Pq, p, "q", heads, pos, qbuf, 0);
        const att = get(p + "att"), am = att[0], ak = att[1], n = pos + 1;
        for (let h = 0; h < heads; h++) {
          const kh = Math.floor(h / (heads / kvh));
          for (let i = 0; i < hd; i++) qv[i] = qbuf[h * hd + i];
          X.scores(Q, Koff[L] + kh * hd * 2, row * 2, n, SC);
          let umax = -Infinity;
          for (let j = 0; j < n; j++) { const u = rshift(scv[j] * am, ak); scv[j] = 0; ev[j] = u; if (u > umax) umax = u; }
          let Es = 0;
          for (let j = 0; j < n; j++) { const d = umax - ev[j], sh = Math.floor(d / 1024); const e = sh >= 13 ? 0 : Math.floor(exp2[d % 1024] / P2[sh]); ev[j] = e; Es += e; }
          X.wsum(EB, Voff[L] + kh * hd * 2, row * 2, n, WS);
          const sig = sigmoid(g[h]);
          for (let i = 0; i < hd; i++) o[h * hd + i] = rshift(rdiv(Number(wsv[i]), Es) * sig, 15);
        }
        T = quant(o, dim, P2[8]);
        const ao = linear(p + "o", T);
        for (let i = 0; i < dim; i++) x[i] += ao[i];
        T = quant(x, dim, rms(x, dim));
        const up = Float64Array.from(linear(p + "up", T));
        const gt = linear(p + "gt", T);
        for (let i = 0; i < ffn; i++) hdn[i] = rshift(rshift(gt[i] * sigmoid(gt[i]), 15) * up[i], 16);
        T = quant(hdn, ffn, P2[16]);
        const dn = linear(p + "down", T);
        for (let i = 0; i < dim; i++) x[i] += dn[i];
        if (L < half) saved.push(Float64Array.from(x));
      }
      const T = quant(x, dim, rms(x, dim));
      this.pos += 1;
      return linear("head", T, 12);  // Int32Array view of Q12 logits, valid until the next call
    },
  };
  return eng;
}
