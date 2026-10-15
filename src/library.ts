import { ALPHABET, PAGE_CHARS, indexOf, normalize } from "./alphabet.ts";
import { decode, encode } from "./codec.ts";
import { fromAddress, toAddress, type Address } from "./address.ts";
import type { Model } from "./model.ts";

export type Page = { text: string; address: Address; bits: number };

export const toChars = (text: string) => Uint8Array.from([...text], indexOf);
export const toText = (chars: Uint8Array) => Array.from(chars, (i) => ALPHABET[i]).join("");

/** The canonical address of any 3200-character page. Every page has exactly one. */
export function addressOf(model: Model, text: string): Page {
  if ([...text].length !== PAGE_CHARS) throw new Error(`a page has exactly ${PAGE_CHARS} characters`);
  const n = encode(model, toChars(text));
  return { text, address: toAddress(n), bits: n.toString(2).length };
}

/**
 * The page at an address. `canonical` is false when the number is not any page's
 * catalogue number: it still lands on a page, but that page is filed elsewhere.
 */
export function pageAt(model: Model, address: Address): Page & { canonical: boolean } {
  const n = fromAddress(address);
  const { chars, rest } = decode(model, n, PAGE_CHARS);
  return { text: toText(chars), address, bits: n.toString(2).length, canonical: rest === 0n };
}

/** Wander into a random gallery: random bits, read through the model. */
export function randomPage(model: Model, seed?: string): Page {
  const rng = seeded(seed ?? crypto.getRandomValues(new Uint32Array(4)).join("."));
  const { chars } = decode(model, randomBigInt(rng, PAGE_CHARS * 8), PAGE_CHARS);
  return addressOf(model, toText(chars));
}

/**
 * Find a page that contains `query`, surrounded by text the model writes around it:
 * the text before it is drawn at random, and the text after continues from it.
 * Same query + seed → same page, so (query, seed) is a short shareable recipe.
 */
export function search(model: Model, query: string, seed = "0"): Page & { offset: number } {
  let q = normalize(query);
  if (q.length === 0) throw new Error("empty query");
  if (q.length > PAGE_CHARS) throw new Error(`query longer than a page (${PAGE_CHARS} chars)`);
  const rng = seeded(`${seed}|${q}`);
  // Keep words whole: pad with spaces when there is room.
  if (q.length + 2 <= PAGE_CHARS) q = ` ${q.trim()} `;
  const offset = q.length === PAGE_CHARS ? 0 : rng() % (PAGE_CHARS - q.length + 1);
  const before = decode(model, randomBigInt(rng, offset * 8), offset).chars;
  const head = new Uint8Array([...before, ...toChars(q)]);
  const after = decode(model, randomBigInt(rng, PAGE_CHARS * 8), PAGE_CHARS - head.length, head).chars;
  const page = addressOf(model, toText(new Uint8Array([...head, ...after])));
  return { ...page, offset: offset + (q.startsWith(" ") ? 1 : 0) };
}

// --- deterministic randomness (identical on every platform) ---

type Rng = () => number;

/** sfc32 seeded from a string via FNV-1a; returns uint32. */
export function seeded(seed: string): Rng {
  const h = (salt: number) => {
    let x = 0x811c9dc5 ^ salt;
    for (const c of seed) x = Math.imul(x ^ c.codePointAt(0)!, 0x01000193);
    return x >>> 0;
  };
  let a = h(1), b = h(2), c = h(3), d = h(4);
  return () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
}

function randomBigInt(rng: Rng, bits: number): bigint {
  let n = 0n;
  for (let i = 0; i < bits; i += 32) n = (n << 32n) | BigInt(rng());
  return n;
}
