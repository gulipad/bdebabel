import { readFileSync } from "node:fs";
import { fastEngine } from "./fast.js";
import { makeVocab, writePage } from "./library.js";
const S = "/private/tmp/claude-501/-Users-gulipad-dev-bdebabel/89a1e17a-a03c-4fd3-8953-9067b4c09155/scratchpad/phone/";
const here = (f) => new URL(f, import.meta.url);
const man = JSON.parse(readFileSync(S + "manifest.json"));
const eng = await fastEngine(new Uint8Array(readFileSync(here("./model.bin"))), JSON.parse(readFileSync(here("./model.json"))), readFileSync(here("./engine.wasm")));
const vocab = makeVocab(JSON.parse(readFileSync(S + "vocab.json")));
for (const seed of ["uno", "dos"]) {
  const t0 = performance.now(); let last, n = 0;
  for (const s of writePage(eng, vocab, man.sampler_exp2, seed)) { last = s; n++; }
  const dt = (performance.now() - t0) / 1000;
  console.log(`=== seed "${seed}": ${n} tokens, ${last.text.length} chars in ${dt.toFixed(2)} s (${(n / dt).toFixed(0)} tok/s)\n${last.text.slice(0, 900)}…\n`);
}
