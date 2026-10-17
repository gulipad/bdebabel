// Worker: writes pages of a frozen universe to JSONL for the safety and memorization checks.
//   node safety_pages.mjs <uid> random <start> <count> <out.jsonl>
//   node safety_pages.mjs <uid> search <queries.json> <part> <parts> <out.jsonl>
import { readFileSync, appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const [uid, mode, a, b, c] = process.argv.slice(2);
const d = join(ROOT, "lab/universes", uid), m = JSON.parse(readFileSync(join(d, "manifest.json")));
const { fastEngine } = await import(join(d, "engine/fast.js")), { Library } = await import(join(d, "engine/codec.js"));
const eng = await fastEngine(new Uint8Array(readFileSync(join(d, "model/model.bin"))), JSON.parse(readFileSync(join(d, "model/model.json"))), readFileSync(join(d, "model/engine.wasm")));
const lib = new Library(eng, JSON.parse(readFileSync(join(d, "model/library.json"))), m.settings);
function randomNumber(seed, chars) { let x = 0n; const bits = chars * 16; for (let i = 0; i * 256 < bits; i++) x = (x << 256n) | BigInt("0x" + createHash("sha256").update(`${seed}:${i}`).digest("hex")); return x >> BigInt(Math.ceil(bits / 256) * 256 - bits); }
if (mode === "random") {
  for (let i = Number(a); i < Number(a) + Number(b); i++) {
    const [text] = lib.pageDecode(randomNumber(`safety-${i}`, 3200));
    appendFileSync(c, JSON.stringify({ kind: "random", i, text }) + "\n");
  }
} else {
  const qs = JSON.parse(readFileSync(a)), part = Number(b), parts = Number(c), out = process.argv[7];
  qs.forEach((q, i) => {
    if (i % parts !== part) return;
    for (const seed of ["s1", "s2"]) { const r = lib.search(q.text, seed); appendFileSync(out, JSON.stringify({ kind: "search", query: q.text, group: q.group, seed, text: r.page }) + "\n"); }
  });
}
