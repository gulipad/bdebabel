import { readFileSync } from "node:fs";
import { wasmEngine } from "./engine.js";
const here = (f) => new URL(f, import.meta.url);
const eng = await wasmEngine(new Uint8Array(readFileSync(here("./model.bin"))), JSON.parse(readFileSync(here("./model.json"))), readFileSync(here("./matvec.wasm")));
let t = 0, t0 = performance.now(), last = t0; const out = [];
for (let i = 1; i <= 800; i++) {
  const z = eng.step(t); let b = 0; for (let j = 1; j < z.length; j++) if (z[j] > z[b]) b = j; t = b;
  if (i % 200 === 0) { const now = performance.now(); out.push(`tokens ${i - 199}-${i}: ${(200 / ((now - last) / 1000)).toFixed(0)} tok/s`); last = now; }
}
console.log(out.join(" · "), `· whole page of 800 tokens: ${((performance.now() - t0) / 1000).toFixed(2)} s`);
