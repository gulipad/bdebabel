// The Library in integer arithmetic (universe babel-1): every page has one address, the exact rANS
// encoding of its text under the integer engine's distribution. Ports lab/lm_library.py rule for rule:
// trimmed vocabulary, repetition penalty, dialogue and paragraph nudges, word penalties, loop breaker,
// min-p, a +1 floor for every token that fits, an escape slot to a character writer, most-likely-first
// layout, and the page mixture with the character writer. All frequencies are integers below 2^53;
// the rANS state is a BigInt. Any device that runs this computes the same page for the same address.

import { makeBPE } from "./bpe.js";

const P2 = Array.from({ length: 64 }, (_, k) => 2 ** k);
const rdiv = (a, b) => Math.floor((2 * a + b) / (2 * b));

/** log2(n) in Q16 for an integer n >= 1 below 2^53, from the shipped table log2(1 + f/4096) (Q16). */
function ilog2q16(n, L) {
  let b = 0, m = n; while (m >= 2 ** 31) { m = Math.floor(m / 2); b++; }
  const lead = 31 - Math.clz32(m);                       // n = m·2^b, 2^lead <= m < 2^(lead+1)
  const top = lead >= 12 ? Math.floor(m / 2 ** (lead - 12)) : m * 2 ** (12 - lead);  // 12 bits after the leading one
  return (lead + b) * 65536 + L[top - 4096];
}

export const BABEL1 = {  // babel-exp-1's settings in integer form (Q12 nats = 4096 per nat)
  penalty: [13, 10], window: 128, dialogue: 4096, paragraph: 6144, paragraphMin: 200,
  avoid: 6 * 4096, violence: 6 * 4096, profanity: 3 * 4096, loop: 4 * 4096,
  minP: 16024,  // round(ln(1/0.02)·4096): min-p 0.02 as a Q12 nats margin
};

export class Library {
  constructor(engine, tables, settings = BABEL1) {
    this.eng = engine; this.s = settings; this.t = tables;
    this.ids = tables.ids; this.K = tables.ids.length;
    this.texts = tables.texts; this.lens = Int32Array.from(tables.texts, (x) => x.length);
    for (const f of ["penalizable", "opens_dialogue", "ends_line", "breaks_line", "avoid", "violent", "profane"]) this[f] = Uint8Array.from(tables[f]);
    this.index = new Map(this.ids.map((id, k) => [id, k]));
    this.byText = new Map();
    this.ids.forEach((id, k) => { const t = this.texts[k]; if (tables.natural[k] || !this.byText.has(t)) this.byText.set(t, id); });
    this.longest = Math.max(...this.lens);
    this.bpe = makeBPE(tables.vocab, tables.merges);
    this.exp2 = tables.exp2_q31; this.L = tables.log2_q16; this.TOP = tables.top; this.MIX = BigInt(tables.mix_t);
    this.PAGE = tables.page_chars; this.bos = tables.bos;
    this.ctx = engine.context;
    const fb = tables.fallback; this.fbChars = fb.chars; this.fbW = fb.weights;
    this.fbCsum = []; let c = 0; for (const w of fb.weights) { c += w; this.fbCsum.push(c); }
    this.fbIndex = new Map(fb.chars.map((ch, i) => [ch, i]));
    this.alphabet = new Set(Array.from(tables.alphabet));
  }

  // --- the character writer ---
  fbDecode(x, chars) {
    const T = BigInt(this.fbCsum[this.fbCsum.length - 1]); let out = "";
    for (let i = 0; i < chars; i++) {
      const r = Number(x % T); let j = 0; while (this.fbCsum[j] <= r) j++;
      const f = this.fbW[j]; x = BigInt(f) * (x / T) + BigInt(r - (this.fbCsum[j] - f));
      out += this.fbChars[j];
    }
    return [out, x];
  }
  fbStep(ch) { const j = this.fbIndex.get(ch); return [this.fbW[j], this.fbCsum[j] - this.fbW[j], this.fbCsum[this.fbCsum.length - 1]]; }
  fbEncode(text) {
    let x = 0n; const chars = Array.from(text);
    for (let i = chars.length - 1; i >= 0; i--) { const [f, c, T] = this.fbStep(chars[i]); x = (x / BigInt(f)) * BigInt(T) + BigInt(c) + (x % BigInt(f)); }
    return x;
  }

  idsOf(items) { const out = []; for (const it of items) { if (typeof it === "string") out.push(...this.bpe.encode(it)); else out.push(it); } return out; }
  textOf(items) { return items.map((it) => (typeof it === "string" ? it : this.texts[this.index.get(it)])).join(""); }

  // --- the model as an integer distribution over the trimmed vocabulary ---
  *steps(context) {
    const seen = context.slice(); const bos = this.bos, max = this.ctx;
    const restart = () => {
      this.eng.reset();
      const window = seen.length + bos.length >= max ? seen.slice(-(max >> 1)) : seen;
      let z; for (const t of bos.concat(window)) z = this.eng.step(t);
      return [bos.length + window.length, z];
    };
    let [used, z] = restart();
    while (true) {
      const tok = yield z;
      seen.push(tok);
      if (used + 1 >= max) [used, z] = restart();
      else { z = this.eng.step(tok); used += 1; }
    }
  }

  dist(z, remaining, hist) {
    const K = this.K, s = this.s, zz = new Float64Array(K);
    for (let k = 0; k < K; k++) zz[k] = z[this.ids[k]];
    if (hist.length) {
      const recent = new Set();
      for (const t of hist.slice(-s.window)) { const k = this.index.get(t); if (k !== undefined && this.penalizable[k]) recent.add(k); }
      for (const k of recent) zz[k] = zz[k] > 0 ? rdiv(zz[k] * s.penalty[1], s.penalty[0]) : rdiv(zz[k] * s.penalty[0], s.penalty[1]);
      if (this.ends_line[this.index.get(hist[hist.length - 1]) ?? 0]) for (let k = 0; k < K; k++) if (this.opens_dialogue[k]) zz[k] -= s.dialogue;
    }
    if (hist.length >= 4) {
      for (let period = 1; period <= 8; period++) {
        const reps = period <= 3 ? 4 : 3, n = reps * period;
        if (hist.length < n) continue;
        const tail = hist.slice(-n); let loop = true;
        for (let i = 0; i < n; i++) if (tail[i] !== tail[n - period + (i % period)]) { loop = false; break; }
        const k = this.index.get(tail[n - period]);
        if (loop && k !== undefined) { zz[k] -= s.loop; break; }
      }
    }
    for (let k = 0; k < K; k++) {
      if (this.avoid[k]) zz[k] -= s.avoid;
      if (this.violent[k]) zz[k] -= s.violence;
      if (this.profane[k]) zz[k] -= s.profanity;
    }
    if (hist.length) {  // while a narrative paragraph is still short, break it a bit less often
      let para = "", i = hist.length - 1;
      while (i >= 0 && para.length < s.paragraphMin) {
        const k = this.index.get(hist[i]); const t = k !== undefined ? this.texts[k] : "";
        if (t.includes("\n")) { para = t.slice(t.lastIndexOf("\n") + 1) + para; break; }
        para = t + para; i -= 1;
      }
      const st = para.trim(), ls = para.replace(/^\s+/, "");
      if (st.length > 0 && st.length < s.paragraphMin && !/^[—\-–«"]/.test(ls)) for (let k = 0; k < K; k++) if (this.breaks_line[k]) zz[k] -= s.paragraph;
    }
    let zmax = -Infinity;
    for (let k = 0; k < K; k++) if (this.lens[k] <= remaining && zz[k] > zmax) zmax = zz[k];
    const freq = new Float64Array(K + 1);
    for (let k = 0; k < K; k++) {
      if (this.lens[k] > remaining) continue;
      const d = zmax - zz[k];
      let e = 0;
      if (d <= s.minP) {
        const u = rdiv(d * 5909, 4096);              // log2 domain, Q12 (5909 = log2(e)·4096)
        const sh = Math.floor(u / 4096);
        e = sh >= 32 ? 0 : Math.floor(this.exp2[u % 4096] / P2[sh]);  // Q31: the best token gets 2^31
      }
      freq[k] = e + 1;                               // +1: every token that fits stays reachable
    }
    freq[K] = 1;                                     // escape slot: write one character with the writer
    return this.layout(freq);
  }

  layout(freq) {
    const N = freq.length, top = [];
    const big = []; for (let k = 0; k < N; k++) if (freq[k] > 1) big.push(k);
    big.sort((a, b) => freq[b] - freq[a] || a - b);
    for (const k of big) { if (top.length >= this.TOP) break; top.push(k); }
    for (let v = 1; v >= 0 && top.length < this.TOP; v--) for (let k = 0; k < N && top.length < this.TOP; k++) if (freq[k] === v) top.push(k);
    const inTop = new Uint8Array(N); for (const k of top) inTop[k] = 1;
    const order = top.slice(); for (let k = 0; k < N; k++) if (!inTop[k]) order.push(k);
    const csum = new Float64Array(N), start = new Float64Array(N); let c = 0;
    for (let p = 0; p < N; p++) { const k = order[p]; start[k] = c; c += freq[k]; csum[p] = c; }
    return { freq, start, order, csum, total: c };
  }

  // --- the codec ---
  decode(x, chars, context = []) {
    const ctx = this.idsOf(context), st = this.steps(ctx); let z = st.next().value;
    const out = [], hist = ctx.slice(), ESC = this.K; let remaining = chars;
    while (remaining > 0) {
      const D = this.dist(z, remaining, hist), T = BigInt(D.total), r = Number(x % T);
      let lo = 0, hi = D.order.length - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (D.csum[m] > r) hi = m; else lo = m + 1; }
      const k = D.order[lo], f = D.freq[k];
      x = BigInt(f) * (x / T) + BigInt(r - D.start[k]);
      let added;
      if (k === ESC) { let c; [c, x] = this.fbDecode(x, 1); out.push(c); added = this.idsOf([c]); remaining -= 1; }
      else { out.push(this.ids[k]); added = [this.ids[k]]; remaining -= this.lens[k]; }
      hist.push(...added);
      if (remaining > 0) for (const t of added) z = st.next(t).value;
    }
    return [out, x];
  }

  canonical(text) {
    // Per pre-token piece: the tokenizer's own tokens when they are all printable and spell the piece exactly;
    // otherwise (a piece with a character the vocabulary can't write alone) greedy longest match inside that
    // piece only, escaping single characters to the character writer. Pieces never interact.
    const out = [];
    for (const [p, ids] of this.bpe.pieces(text)) {
      if (ids.every((t) => this.index.has(t)) && ids.map((t) => this.texts[this.index.get(t)]).join("") === p) { out.push(...ids); continue; }
      let i = 0;
      while (i < p.length) {
        let hit = false;
        for (let n = Math.min(this.longest, p.length - i); n > 0; n--) {
          const t = this.byText.get(p.slice(i, i + n));
          if (t !== undefined) { out.push(t); i += n; hit = true; break; }
        }
        if (!hit) { out.push(p[i]); i += 1; }
      }
    }
    return out;
  }

  encode(text) {
    const items = this.canonical(text), st = this.steps([]); let z = st.next().value;
    const coded = [], hist = [], ESC = this.K; let remaining = text.length;
    items.forEach((it, i) => {
      const D = this.dist(z, remaining, hist); let added;
      if (typeof it === "string") {
        if (!this.alphabet.has(it)) throw new Error(`character outside the alphabet: ${it}`);
        coded.push([D.freq[ESC], D.start[ESC], D.total], this.fbStep(it)); added = this.idsOf([it]); remaining -= 1;
      } else {
        const k = this.index.get(it); coded.push([D.freq[k], D.start[k], D.total]); added = [it]; remaining -= this.lens[k];
      }
      hist.push(...added);
      if (i + 1 < items.length) for (const t of added) z = st.next(t).value;
    });
    let x = 0n;
    for (let i = coded.length - 1; i >= 0; i--) { const [f, c, T] = coded[i].map(BigInt); x = (x / f) * T + c + (x % f); }
    return x;
  }

  // --- pages: a mixture of the model (all but 1 in MIX) and the character writer ---
  pageDecode(n, chars = this.PAGE) {
    const T = this.MIX, r = n % T;
    if (r < T - 1n) { const [toks, rest] = this.decode((T - 1n) * (n / T) + r, chars); return [this.textOf(toks), rest]; }
    return this.fbDecode(n / T, chars);
  }
  pageEncode(text) {
    const T = this.MIX; let best = this.fbEncode(text) * T + (T - 1n);
    try { const m = this.encode(text); const v = (m / (T - 1n)) * T + (m % (T - 1n)); if (v < best) best = v; } catch (e) { /* model can't spell it: writer only */ }
    return best;
  }
  pageAt(n) { const [text, rest] = this.pageDecode(n); return [text, rest === 0n && this.pageEncode(text) === n]; }
}

const VARIANTS = [["\r\n", "\n"], ["\r", "\n"], ["\t", " "], ["\u00a0", " "], ["\u2009", " "], ["\u202f", " "], ["„", "“"], ["‟", "“"],
  ["‚", "‘"], ["‛", "‘"], ["‹", "«"], ["›", "»"], ["‐", "-"], ["‑", "-"], ["‒", "–"], ["―", "—"], ["−", "-"], ["´", "'"], ["`", "'"]];

/** Queries: NFC, typographic variants mapped onto the alphabet; returns [text, characters removed]. */
export function normalize(text, alphabet) {
  text = text.normalize("NFC");
  for (const [a, b] of VARIANTS) text = text.split(a).join(b);
  const kept = Array.from(text).filter((c) => alphabet.has(c)).join("");
  const removed = [...new Set(Array.from(text).filter((c) => !alphabet.has(c)))].join("");
  return [kept, removed];
}

/** A seeded stream of random BigInts (xorshift32 words), for search. */
function bitStream(seed) {
  let h = 2166136261 >>> 0;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  let s = h || 1;
  const word = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; };
  return {
    bits(n) { let x = 0n; for (let i = 0; i < Math.ceil(n / 32); i++) x = (x << 32n) | BigInt(word()); return x; },
    below(m) { return (word() * 2 ** 21 + (word() >>> 11)) % m; },
  };
}

Library.prototype.backward = function (qToks, n, allowStart, rng, stopAtParagraph) {
  // Drafts up to n tokens right to left from the query, from the engine positioned after [<r2l>] + reversed query.
  const eos = this.t.eos, minP = 21702  /* round(ln(1/0.005)·4096) */, out = []; let logq = 0;
  let z = this._qz;
  for (let i = 0; i < n; i++) {
    let zmax = -Infinity;
    for (let k = 0; k < this.K; k++) { const v = z[this.ids[k]]; if (v > zmax) zmax = v; }
    if (allowStart && z[eos] > zmax) zmax = z[eos];
    const cand = [], w = []; let tot = 0;
    const consider = (id) => { const d = zmax - z[id]; if (d > minP) return; const u = rdiv(d * 5909, 4096), sh = Math.floor(u / 4096); const e = sh >= 32 ? 0 : Math.floor(this.exp2[u % 4096] / P2[sh]); if (e > 0) { cand.push(id); w.push(e); tot += e; } };
    for (let k = 0; k < this.K; k++) consider(this.ids[k]);
    if (allowStart) consider(eos);
    let r = rng.below(tot), j = 0; while (r >= w[j]) { r -= w[j]; j++; }
    const t = cand[j]; logq += ilog2q16(w[j], this.L) - ilog2q16(tot, this.L);   // log2 q, Q16
    if (t === eos) return [out.reverse(), logq, true];
    if (stopAtParagraph && out.length && this.texts[this.index.get(t)].includes("\n")) return [out.reverse(), logq, true];
    out.push(t); z = this.eng.step(t);
  }
  return [out.reverse(), logq, false];
};

Library.prototype.logp = function (items, remaining, hist) {
  // log2 probability (Q16 integer) of items continuing from the engine's current position, under the Library.
  let lp = 0, z = this._fz; hist = hist.slice();
  items.forEach((it, j) => {
    const D = this.dist(z, remaining, hist);
    let added;
    if (typeof it === "string") {  // escape slot, then the character writer
      const [f, , T] = this.fbStep(it);
      lp += ilog2q16(D.freq[this.K], this.L) - ilog2q16(D.total, this.L) + ilog2q16(f, this.L) - ilog2q16(T, this.L);
      added = this.idsOf([it]); remaining -= 1;
    } else {
      const k = this.index.get(it);
      lp += ilog2q16(D.freq[k], this.L) - ilog2q16(D.total, this.L); added = [it]; remaining -= this.lens[k];  // log2 p, Q16
    }
    hist.push(...added);
    if (j + 1 < items.length) for (const t of added) z = this.eng.step(t);
  });
  return lp;
};

Library.prototype.decodeOn = function (x, chars, hist, z) {
  // decode() continuing from the engine's current position (no restart: the page fits the context).
  const out = [], ESC = this.K; let remaining = chars; hist = hist.slice();
  while (remaining > 0) {
    const D = this.dist(z, remaining, hist), T = BigInt(D.total), r = Number(x % T);
    let lo = 0, hi = D.order.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (D.csum[m] > r) hi = m; else lo = m + 1; }
    const k = D.order[lo], f = D.freq[k]; x = BigInt(f) * (x / T) + BigInt(r - D.start[k]);
    let added;
    if (k === ESC) { let c; [c, x] = this.fbDecode(x, 1); out.push(c); added = this.idsOf([c]); remaining -= 1; }
    else { out.push(this.ids[k]); added = [this.ids[k]]; remaining -= this.lens[k]; }
    hist.push(...added);
    if (remaining > 0) for (const t of added) z = this.eng.step(t);
  }
  return out;
};

/**
 * Search: a page containing the query, drawn (approximately) in proportion to its probability in the Library.
 * The start of the page comes from the Library, cut at a paragraph break; the model's right-to-left mode drafts
 * n paragraphs that lead into the query; each is weighed by p_Library(draft + query) / q_backward(draft); one is
 * drawn by weight; the Library writes the rest. The page's address is then its canonical encoding, as always.
 */
Library.prototype.search = function (query, seed, { n = 8, bridge = 96 } = {}) {
  let [q] = normalize(query, this.alphabet);
  const rng = bitStream(seed + "|" + q.toLowerCase());
  q = " " + q.trim();
  const qToks = this.canonical(q), qIds = this.idsOf(qToks);  // items (tokens, or escaped characters) and model ids
  const r2l = this.t.vocab["<|r2l|>"];
  for (let attempt = 1; attempt <= 3; attempt++) {
    const farChars = rng.below(Math.max(1, this.PAGE - q.length - 4 * bridge));
    let far = farChars ? this.decode(rng.bits(farChars * 16 + 64), farChars)[0] : [];
    let cut = 0; far.forEach((t, i) => { if (typeof t !== "string" && this.texts[this.index.get(t)].endsWith("\n")) cut = i + 1; });
    far = far.slice(0, cut);
    if (far.some((t) => typeof t === "string")) far = [];
    // drafts, written backwards from the query (engine prefix shared through rewinds)
    this.eng.reset(); let z; for (const t of [r2l, ...qIds.slice().reverse()]) z = this.eng.step(t);
    const qPos = this.eng.pos; this._qz = Int32Array.from(z);
    const drafts = [];
    for (let i = 0; i < n; i++) { this.eng.pos = qPos; drafts.push(this.backward(qIds, bridge, far.length === 0, rng, far.length > 0)); }
    // the far part, then each draft's probability under the Library (rewinding to the end of the far part)
    this.eng.reset(); for (const t of this.bos.concat(far)) z = this.eng.step(t);
    const fPos = this.eng.pos; this._fz = Int32Array.from(z);
    const farText = this.textOf(far), parts = [];
    let rejected = 0;
    for (const [b, logq, joined] of drafts) {
      if (!joined) { rejected++; continue; }
      const first = this.textOf(b.concat(qToks)).replace(/^ +/, "");
      if (!first || !(first[0] !== first[0].toLowerCase() || "—-«¿¡\"“".includes(first[0]))) { rejected++; continue; }
      const headText = farText + this.textOf(b);
      const canon = this.canonical(headText + q).slice(0, far.length + b.length);
      if (canon.length !== far.length + b.length || canon.some((t, i) => t !== far.concat(b)[i])) { rejected++; continue; }
      if (headText.length + q.length > this.PAGE) { rejected++; continue; }
      this.eng.pos = fPos;
      parts.push([this.logp(b.concat(qToks), this.PAGE - farText.length, far), logq, b]);
    }
    if (!parts.length) continue;
    // weights p/q in integers: log2 Q16 -> Q12 -> the shipped Q31 2^-f table; one integer draw
    const lw = parts.map(([lp, lq]) => lp - lq), m = Math.max(...lw);
    const w = lw.map((v) => { const u = Math.floor((m - v) / 16), sh = Math.floor(u / 4096); return sh >= 32 ? 0 : Math.floor(this.exp2[u % 4096] / P2[sh]); });
    const W = w.reduce((a, c) => a + c, 0);
    let u = rng.below(W), k = 0; while (u >= w[k]) { u -= w[k]; k++; }
    const head = far.concat(parts[k][2], qToks), used = this.textOf(head).length;
    this.eng.pos = fPos; z = this._fz;
    for (const t of parts[k][2].concat(qIds)) z = this.eng.step(t);
    const after = this.decodeOn(rng.bits(this.PAGE * 16), this.PAGE - used, far.concat(parts[k][2], qIds), z);
    const page = this.textOf(head) + this.textOf(after);
    const ess = W * W / w.reduce((a, c) => a + c * c, 0);  // reported only
    return { page, offset: used - q.length + 1, attempts: attempt, drafts: parts.length, rejected, ess: Math.round(ess * 100) / 100 };
  }
  return this.searchPlain(q, rng);  // only if no draft joined in 3 tries (rare)
};

/** Fallback search: the query exactly as typed, after a paragraph break of a Library page, then the Library continues. */
Library.prototype.searchPlain = function (q, rng) {
  const items = this.canonical(q.replace(/^ /, ""));
  const farChars = rng.below(Math.max(1, this.PAGE - q.length - 2));
  let far = farChars ? this.decode(rng.bits(farChars * 16 + 64), farChars)[0] : [];
  let cut = 0; far.forEach((t, i) => { if (typeof t !== "string" && this.texts[this.index.get(t)].endsWith("\n")) cut = i + 1; });
  far = far.slice(0, cut);
  const head = far.concat(items), used = this.textOf(head).length;
  const after = this.decode(rng.bits(this.PAGE * 16), this.PAGE - used, head)[0];
  return { page: this.textOf(head) + this.textOf(after), offset: used - this.textOf(items).length, attempts: 0, drafts: 0, rejected: 0, ess: 0, plain: true };
};

/** A random address: chars·16 random bits from a seed (xorshift; babel-1's own rule, not Python's). */
export function randomAddress(seed, chars = 3200) {
  let h = 2166136261 >>> 0;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  let s = h || 1, x = 0n;
  for (let i = 0; i < chars / 2; i++) { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; x = (x << 32n) | BigInt(s); }
  return x;
}
