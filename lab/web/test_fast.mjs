// node test_fast.mjs: the fast WebAssembly engine must match the numpy reference exactly; then page speed.
import { readFileSync } from "node:fs";
import { fastEngine } from "./fast.js";
const here = (f) => new URL(f, import.meta.url);
const index = JSON.parse(readFileSync(here("./model.json")));
const golden = JSON.parse(readFileSync(here("./golden.json")));
const eng = await fastEngine(new Uint8Array(readFileSync(here("./model.bin"))), index, readFileSync(here("./engine.wasm")));
let mism = 0;
for (let i = 0; i < golden.tokens.length; i++) {
  const z = eng.step(golden.tokens[i]), g = golden.logits[i];
  for (let j = 0; j < z.length; j++) if (z[j] !== g[j]) { if (!mism) console.log(`first mismatch at position ${i}, logit ${j}: ${z[j]} vs ${g[j]}`); mism++; break; }
}
console.log(`golden: ${mism === 0 ? "ALL 48 positions identical to numpy" : mism + " positions differ"}`);
eng.reset();
let t = golden.tokens[0], t0 = performance.now(), last = t0; const out = [];
for (let i = 1; i <= 800; i++) {
  const z = eng.step(t); let b = 0; for (let j = 1; j < z.length; j++) if (z[j] > z[b]) b = j; t = b;
  if (i % 200 === 0) { const now = performance.now(); out.push(`${i - 199}-${i}: ${(200 / ((now - last) / 1000)).toFixed(0)} tok/s`); last = now; }
}
console.log(out.join(" · "), `· full 800-token page: ${((performance.now() - t0) / 1000).toFixed(2)} s`);
