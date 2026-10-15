// Exact rANS (asymmetric numeral systems) over unbounded BigInt state.
//
// One decode step is a bijection  ℕ ⟷ Σ × ℕ :
//   decode(x)    = (s, f_s·⌊x/T⌋ + (x mod T) − cum_s)   where cum_s ≤ x mod T < cum_s + f_s
//   encode(s, x) = ⌊x/f_s⌋·T + cum_s + (x mod f_s)
// Chaining 3200 steps maps an integer to a page plus a leftover integer. The page's
// catalogue number is encode(page, 0): the unique integer that decodes to the page
// with nothing left over. Its size is ≈ −log₂ P(page) bits, so text the model finds
// likely gets a short address, and noise gets an astronomically long one.

import { distribution, type Model } from "./model.ts";

export function decode(model: Model, x: bigint, n: number, prefix: Uint8Array = new Uint8Array(0)) {
  const buf = new Uint8Array(prefix.length + n);
  buf.set(prefix);
  for (let i = prefix.length; i < buf.length; i++) {
    const { freq, cum, total } = distribution(model, buf, i);
    const T = BigInt(total);
    const r = Number(x % T);
    let s = freq.length - 1;
    while (cum[s] > r) s--;
    x = BigInt(freq[s]) * (x / T) + BigInt(r - cum[s]);
    buf[i] = s;
  }
  return { chars: buf.subarray(prefix.length), rest: x };
}

/** Encodes chars[from..] (earlier chars are context only), last character first. */
export function encode(model: Model, chars: Uint8Array, x = 0n, from = 0): bigint {
  for (let i = chars.length - 1; i >= from; i--) {
    const { freq, cum, total } = distribution(model, chars, i);
    const s = chars[i];
    const f = BigInt(freq[s]);
    x = (x / f) * BigInt(total) + BigInt(cum[s]) + (x % f);
  }
  return x;
}
