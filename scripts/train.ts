// Builds model/model.bin from corpus/raw/*.txt.
// Usage: npm run train [-- <maxOrder=7> <minCount=2>]
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { normalize } from "../src/alphabet.ts";
import { train, serialize, distribution } from "../src/model.ts";
import { toChars } from "../src/library.ts";

const maxOrder = Number(process.argv[2] ?? 7);
const minCount = Number(process.argv[3] ?? 2);
const RAW = new URL("../corpus/raw/", import.meta.url);

function clean(raw: string): string {
  const start = raw.search(/\*\*\* ?START OF/);
  const end = raw.search(/\*\*\* ?END OF/);
  let body = raw.slice(start >= 0 ? raw.indexOf("\n", start) : 0, end >= 0 ? end : undefined);
  body = body
    .replace(/\[(\d+|[a-z])\]/gi, "") // footnote markers
    .replace(/\r/g, "")
    .replace(/[_*=#]+/g, "")
    .replace(/-{2,}|—{2,}/g, "—");
  return normalize(body);
}

const files = (await readdir(RAW)).filter((f) => f.endsWith(".txt")).sort();
const texts = await Promise.all(files.map(async (f) => clean(await readFile(new URL(f, RAW), "utf8"))));
const all = toChars(texts.join(" "));

// Hold out 1% to measure how well the model predicts unseen Spanish.
const cut = Math.floor(all.length * 0.99);
const t0 = performance.now();
const model = train(all.subarray(0, cut), maxOrder, minCount);
const seconds = ((performance.now() - t0) / 1000).toFixed(1);

const held = all.subarray(cut, cut + 50_000);
let bits = 0;
for (let i = 0; i < held.length; i++) {
  const d = distribution(model, held, i);
  bits += Math.log2(d.total / d.freq[held[i]]);
}

const bytes = serialize(model);
await mkdir(new URL("../model/", import.meta.url), { recursive: true });
await writeFile(new URL("../model/model.bin", import.meta.url), bytes);

console.log(`corpus      ${files.length} books, ${(all.length / 1e6).toFixed(1)}M chars`);
console.log(`model       order ${maxOrder}, minCount ${minCount}, ${model.orders.reduce((s, o) => s + o.keys.length, 0).toLocaleString()} n-grams, ${(bytes.length / 1e6).toFixed(1)} MB, trained in ${seconds}s`);
console.log(`held-out    ${(bits / held.length).toFixed(3)} bits/char  (uniform: ${Math.log2(47).toFixed(3)})`);
