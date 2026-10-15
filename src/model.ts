// Character n-gram language model with Witten–Bell interpolation.
//
// Determinism is the whole game: search (encode) and browse (decode) must compute
// bit-identical frequencies on every machine, forever. So the model only uses
// integer counts plus IEEE-754 +, *, / and Math.floor, which every JS engine
// evaluates identically. No Math.exp/log/pow anywhere on the hot path.
//
// Storage: for each order k (context length), every observed n-gram (k context
// chars + 1 next char) is packed into a single number, base 48 with digits idx+1:
//   key = ((d1 * 48 + d2) * 48 + ... + dk) * 48 + (next+1)
// Keys are sorted, so all continuations of a context sit in one contiguous run
// and a single binary search finds them. 48^9 < 2^53, so contexts up to 8 chars fit.

import { A } from "./alphabet.ts";

const BASE = 48;
export const MAX_SUPPORTED_ORDER = 8;
/** Frequencies are scaled to ~2^24 per step; +1 floor keeps every string possible. */
const SCALE = 2 ** 24;

export type Order = { keys: Float64Array; counts: Uint32Array };
export type Model = { maxOrder: number; orders: Order[] };

export function train(text: Uint8Array, maxOrder: number, minCount = 1): Model {
  if (maxOrder > MAX_SUPPORTED_ORDER) throw new Error(`maxOrder must be <= ${MAX_SUPPORTED_ORDER}`);
  const orders: Order[] = [];
  for (let k = 0; k <= maxOrder; k++) {
    const n = text.length - k;
    const all = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let key = 0;
      for (let j = 0; j <= k; j++) key = key * BASE + text[i + j] + 1;
      all[i] = key;
    }
    all.sort();
    const keys: number[] = [];
    const counts: number[] = [];
    for (let i = 0; i < n; ) {
      let j = i;
      while (j < n && all[j] === all[i]) j++;
      // Pruning rare n-grams keeps the model small; never prune order 0.
      if (k === 0 || j - i >= minCount) { keys.push(all[i]); counts.push(j - i); }
      i = j;
    }
    orders.push({ keys: Float64Array.from(keys), counts: Uint32Array.from(counts) });
  }
  return { maxOrder, orders };
}

function lowerBound(keys: Float64Array, x: number): number {
  let lo = 0, hi = keys.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (keys[mid] < x) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/** A frozen, integer next-character distribution. */
export type Dist = { freq: Uint32Array; cum: Uint32Array; total: number };

/**
 * Next-character distribution given the preceding characters `ctx[0..end)`.
 * Only the last `maxOrder` characters matter.
 */
export function distribution(model: Model, ctx: Uint8Array | number[], end: number): Dist {
  const p = new Float64Array(A).fill(1 / A);
  const counts = new Uint32Array(A);
  for (let k = 0; k <= model.maxOrder && k <= end; k++) {
    let ctxKey = 0;
    for (let j = end - k; j < end; j++) ctxKey = ctxKey * BASE + ctx[j] + 1;
    const lo = ctxKey * BASE;
    const { keys, counts: c } = model.orders[k];
    let i = lowerBound(keys, lo);
    let total = 0, distinct = 0;
    counts.fill(0);
    for (; i < keys.length && keys[i] < lo + BASE; i++) {
      counts[keys[i] - lo - 1] = c[i];
      total += c[i];
      distinct++;
    }
    if (total === 0) break; // unseen context: longer ones are unseen too
    for (let s = 0; s < A; s++) p[s] = (counts[s] + distinct * p[s]) / (total + distinct);
  }
  const freq = new Uint32Array(A);
  const cum = new Uint32Array(A);
  let total = 0;
  for (let s = 0; s < A; s++) {
    freq[s] = Math.floor(p[s] * SCALE) + 1;
    cum[s] = total;
    total += freq[s];
  }
  return { freq, cum, total };
}

// --- (de)serialization: a flat little-endian binary blob, browser-friendly ---

export function serialize(model: Model): Uint8Array {
  const header = new Uint32Array([0x42414245 /* "BABE" */, 1, model.maxOrder, ...model.orders.map((o) => o.keys.length)]);
  let size = header.byteLength;
  for (const o of model.orders) size += o.keys.byteLength + o.counts.byteLength;
  const out = new Uint8Array(size);
  let off = 0;
  const put = (a: ArrayBufferView) => { out.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), off); off += a.byteLength; };
  put(header);
  for (const o of model.orders) { put(o.keys); put(o.counts); }
  return out;
}

export function deserialize(bytes: Uint8Array): Model {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const head = new Uint32Array(buf, 0, 3);
  if (head[0] !== 0x42414245 || head[1] !== 1) throw new Error("not a bdebabel v1 model");
  const maxOrder = head[2];
  const sizes = new Uint32Array(buf, 12, maxOrder + 1);
  let off = 12 + 4 * (maxOrder + 1);
  const orders: Order[] = [];
  for (const n of sizes) {
    // slice() copies into fresh, aligned buffers.
    const keys = new Float64Array(buf.slice(off, off + n * 8)); off += n * 8;
    const counts = new Uint32Array(buf.slice(off, off + n * 4)); off += n * 4;
    orders.push({ keys, counts });
  }
  return { maxOrder, orders };
}
