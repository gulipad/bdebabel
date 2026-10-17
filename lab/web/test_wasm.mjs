// node test_wasm.mjs: the WebAssembly engine must match the numpy reference exactly; reports speed.
import { readFileSync } from "node:fs";
import { wasmEngine } from "./engine.js";
const here = (f) => new URL(f, import.meta.url);
const bin = new Uint8Array(readFileSync(here("./model.bin")));
const index = JSON.parse(readFileSync(here("./model.json")));
const golden = JSON.parse(readFileSync(here("./golden.json")));
const eng = await wasmEngine(bin, index, readFileSync(here("./matvec.wasm")));
let mism = 0;
for (let i = 0; i < golden.tokens.length; i++) {
  const z = eng.step(golden.tokens[i]), g = golden.logits[i];
  for (let j = 0; j < z.length; j++) if (z[j] !== g[j]) { mism++; break; }
}
console.log(`golden: ${mism === 0 ? "ALL 48 positions identical to numpy" : mism + " positions differ"}`);
eng.reset();
let t = golden.tokens[0], t0 = performance.now();
for (let i = 0; i < 200; i++) { const z = eng.step(t); let b = 0; for (let j = 1; j < z.length; j++) if (z[j] > z[b]) b = j; t = b; }
console.log(`WASM SIMD, 1 thread: ${(200 / ((performance.now() - t0) / 1000)).toFixed(0)} tokens/s (200 greedy tokens)`);
