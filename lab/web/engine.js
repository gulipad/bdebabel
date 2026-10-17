// Integer inference engine for the Library's model, mirroring lab/int_engine.py step for step.
// Every value is an integer below 2^53, so plain JavaScript Numbers compute it exactly, and every device
// produces the same logits. Shifts use Math.floor(x / 2^k) (JS >> truncates to 32 bits); divisions use
// Math.floor on quotients of integers below 2^53, which is exact.

const P2 = Array.from({ length: 64 }, (_, k) => 2 ** k);
const rshift = (x, k) => (k > 0 ? Math.floor((x + P2[k - 1]) / P2[k]) : x * P2[-k]);
const rdiv = (a, b) => Math.floor((2 * a + b) / (2 * b));
const isqrt = (n) => {
  let r = Math.floor(Math.sqrt(n));
  if (r * r > n) r -= 1;
  if ((r + 1) * (r + 1) <= n) r += 1;
  return r;
};
const bitlen = (x) => {
  if (x <= 0) return 0;
  if (x < 2 ** 31) return 32 - Math.clz32(x);
  let b = 31;
  while (P2[b] <= x) b++;
  return b;
};

export class Engine {
  /** buffer: ArrayBuffer of model.bin; index: parsed model.json; matvec: optional fast kernel. */
  constructor(buffer, index, matvec = null) {
    this.buf = buffer;
    this.ix = index;
    const cfg = this.arr("cfg");
    [this.vocab, this.layers, this.dim, this.heads, this.kv, this.ffn, this.context] = Array.from(cfg);
    this.hd = this.dim / this.heads;
    this.matvec = matvec || ((name, a8) => this.matvecJS(name, a8));
    this.cache = {};
    this.reset();
  }

  arr(name) {
    const e = this.ix[name];
    if (!e) throw new Error(`missing ${name}`);
    const n = e.shape.reduce((a, b) => a * b, 1);
    return e.dtype === "i8" ? new Int8Array(this.buf, e.offset, n) : new Int32Array(this.buf, e.offset, n);
  }

  get(name) {
    return this.cache[name] || (this.cache[name] = this.arr(name));
  }

  reset() {
    this.pos = 0;
    this.K = Array.from({ length: this.layers }, () => []); // per layer: list of Int32Array(kv*hd), rotated int16 values
    this.V = Array.from({ length: this.layers }, () => []); // per layer: list of Float64Array(kv*hd), Q8
  }

  matvecJS(name, a8) {
    const W = this.get(name + ".w"), shape = this.ix[name + ".w"].shape;
    const rows = shape[0], cols = shape[1], acc = new Float64Array(rows);
    for (let r = 0, o = 0; r < rows; r++, o += cols) {
      let s = 0;
      for (let c = 0; c < cols; c++) s += a8[c] * W[o + c];
      acc[r] = s;
    }
    return acc;
  }

  rms(x) {
    let amax = 0;
    for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > amax) amax = a; }
    const sh = Math.max(bitlen(amax) - 20, 0), d = P2[sh];
    let ms = 0;
    for (let i = 0; i < x.length; i++) { const v = Math.floor(x[i] / d); ms += v * v; }
    const r = isqrt(Math.floor(ms / x.length));
    return Math.max(r, 1) * d;
  }

  quant(x, denom) {
    let amax = 0;
    for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > amax) amax = a; }
    const a8 = new Int8Array(x.length);
    if (amax === 0) return [a8, 0];
    for (let i = 0; i < x.length; i++) a8[i] = rdiv(127 * x[i], amax);
    return [a8, rdiv(amax * P2[24], 127 * denom)];
  }

  linear(name, a8, T, outBits = 16) {
    const acc = this.matvec(name, a8), m = this.get(name + ".m"), k = this.get(name + ".k");
    const out = new Float64Array(acc.length), sh = 24 + (16 - outBits);
    for (let r = 0; r < acc.length; r++) out[r] = rshift(rshift(acc[r] * m[r], k[r]) * T, sh);
    return out;
  }

  pre(name, a8) { // acc * m >> k, without the token factor (QK-norm cancels it)
    const acc = this.matvec(name, a8), m = this.get(name + ".m"), k = this.get(name + ".k");
    const out = new Float64Array(acc.length);
    for (let r = 0; r < acc.length; r++) out[r] = rshift(acc[r] * m[r], k[r]);
    return out;
  }

  qk(P, p, n, heads) {
    const hd = this.hd, half = hd / 2, m = this.get(p + n + "n.m"), k = this.get(p + n + "n.k");
    const rc = this.get("rope_c"), rsn = this.get("rope_s"), base = this.pos * half;
    const out = new Float64Array(heads * hd);
    for (let h = 0; h < heads; h++) {
      const v = P.subarray(h * hd, (h + 1) * hd), r = this.rms(v);
      let amax = 0;
      for (let i = 0; i < hd; i++) { const a = Math.abs(v[i]); if (a > amax) amax = a; }
      const sh = Math.max(bitlen(amax) - 22, 0), d = P2[sh], rr = Math.floor(r / d);
      const q = new Float64Array(hd);
      for (let i = 0; i < hd; i++) q[i] = Math.min(127, Math.max(-127, rdiv(Math.floor(v[i] / d) * m[i], rr * P2[k[i]])));
      for (let i = 0; i < half; i++) {
        const c = rc[base + i], s = rsn[base + i], x1 = q[i], x2 = q[i + half];
        out[h * hd + i] = rshift(x1 * c - x2 * s, 14);
        out[h * hd + i + half] = rshift(x1 * s + x2 * c, 14);
      }
    }
    return out;
  }

  sigmoid(gQ16) {
    const t = this.get("sigmoid");
    return t[Math.min(4095, Math.max(-4096, rshift(gQ16, 8))) + 4096];
  }

  /** Feeds one token; returns the Q12 logits for the next token (Float64Array of integers). */
  step(token) {
    const D = this.dim, H = this.heads, KV = this.kv, hd = this.hd, half = this.layers / 2;
    const em = this.get("embed.m"), ek = this.get("embed.k"), E = this.get("embed.w");
    let x = new Float64Array(D);
    for (let i = 0; i < D; i++) x[i] = rshift(E[token * D + i] * em[token], ek[token]);
    const saved = [], exp2 = this.get("exp2");
    for (let L = 0; L < this.layers; L++) {
      const p = `blocks.${L}.`;
      if (L >= this.layers - half) {
        const j = this.layers - 1 - L, sm = this.get("skip.m")[j], sk = this.get("skip.k")[j], s = saved[j];
        for (let i = 0; i < D; i++) x[i] = x[i] + rshift(s[i] * sm, sk);
      }
      let [a8, T] = this.quant(x, this.rms(x));
      const q = this.qk(this.pre(p + "q", a8), p, "q", H);
      const k = this.qk(this.pre(p + "k", a8), p, "k", KV);
      const vq = this.linear(p + "v", a8, T), v = new Float64Array(vq.length);
      for (let i = 0; i < v.length; i++) v[i] = Math.min(32767, Math.max(-32767, rshift(vq[i], 8)));
      const g = this.linear(p + "gate", a8, T);
      this.K[L].push(k); this.V[L].push(v);
      const att = this.ix[p + "att"] ? this.get(p + "att") : null, am = att[0], ak = att[1];
      const o = new Float64Array(D), n = this.pos + 1, Ks = this.K[L], Vs = this.V[L];
      for (let h = 0; h < H; h++) {
        const kvh = Math.floor(h / (H / KV)), u = new Float64Array(n);
        let umax = -Infinity;
        for (let j = 0; j < n; j++) {
          let s = 0;
          const kk = Ks[j];
          for (let i = 0; i < hd; i++) s += q[h * hd + i] * kk[kvh * hd + i];
          u[j] = rshift(s * am, ak);
          if (u[j] > umax) umax = u[j];
        }
        let Es = 0;
        const num = new Float64Array(hd);
        for (let j = 0; j < n; j++) {
          const d = umax - u[j], sh = Math.floor(d / 1024), e = sh >= 13 ? 0 : Math.floor(exp2[d % 1024] / P2[sh]);
          if (e === 0) continue;
          Es += e;
          const vv = Vs[j];
          for (let i = 0; i < hd; i++) num[i] += e * vv[kvh * hd + i];
        }
        const sig = this.sigmoid(g[h]);
        for (let i = 0; i < hd; i++) o[h * hd + i] = rshift(rdiv(num[i], Es) * sig, 15);
      }
      [a8, T] = this.quant(o, P2[8]);
      const ao = this.linear(p + "o", a8, T);
      for (let i = 0; i < D; i++) x[i] += ao[i];
      [a8, T] = this.quant(x, this.rms(x));
      const up = this.linear(p + "up", a8, T), gt = this.linear(p + "gt", a8, T);
      const hdn = new Float64Array(up.length);
      for (let i = 0; i < up.length; i++) hdn[i] = rshift(rshift(gt[i] * this.sigmoid(gt[i]), 15) * up[i], 16);
      [a8, T] = this.quant(hdn, P2[16]);
      const dn = this.linear(p + "down", a8, T);
      for (let i = 0; i < D; i++) x[i] += dn[i];
      if (L < half) saved.push(Float64Array.from(x));
    }
    const [a8, T] = this.quant(x, this.rms(x));
    this.pos += 1;
    return this.linear("head", a8, T, 12);
  }
}

/** Builds an Engine whose matrix products run in the WebAssembly SIMD kernel (matvec.wasm).
 *  modelBytes: Uint8Array of model.bin; wasmBytes: matvec.wasm. The model lives in WebAssembly memory. */
export async function wasmEngine(modelBytes, index, wasmBytes) {
  const scratch = 1 << 20, page = 65536;
  const aOff = Math.ceil(modelBytes.length / 16) * 16, outOff = aOff + 65536;
  const memory = new WebAssembly.Memory({ initial: Math.ceil((outOff + scratch) / page) });
  new Uint8Array(memory.buffer).set(modelBytes, 0);
  const { instance } = await WebAssembly.instantiate(wasmBytes, { env: { mem: memory } });
  const kernel = instance.exports.matvec, a = new Int8Array(memory.buffer, aOff, 65536);
  const out = new Int32Array(memory.buffer, outOff, scratch / 4 - 16384);
  let eng;
  const matvec = (name, a8) => {
    const e = index[name + ".w"], [rows, cols] = e.shape;
    a.set(a8);
    kernel(e.offset, aOff, outOff, rows, cols);
    return out.subarray(0, rows);  // consumed before the next call
  };
  eng = new Engine(memory.buffer, index, matvec);
  return eng;
}
