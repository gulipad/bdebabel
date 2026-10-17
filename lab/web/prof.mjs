import { readFileSync } from "node:fs";
import { wasmEngine } from "./engine.js";
const here = (f) => new URL(f, import.meta.url);
const bin = new Uint8Array(readFileSync(here("./model.bin")));
const index = JSON.parse(readFileSync(here("./model.json")));
const eng = await wasmEngine(bin, index, readFileSync(here("./matvec.wasm")));
const inner = eng.matvec; let tk = 0, macs = 0;
eng.matvec = (name, a8) => { const t = performance.now(); const r = inner(name, a8); tk += performance.now() - t; const s = index[name + ".w"].shape; macs += s[0] * s[1]; return r; };
let t = 0; const t0 = performance.now(), N = 200;
for (let i = 0; i < N; i++) { const z = eng.step(t); let b = 0; for (let j = 1; j < z.length; j++) if (z[j] > z[b]) b = j; t = b; }
const tot = performance.now() - t0;
console.log(`per token: total ${(tot / N).toFixed(2)} ms · matvec kernel ${(tk / N).toFixed(2)} ms (${(macs / N / 1e6).toFixed(1)}M MACs, ${(macs / tk / 1e6).toFixed(2)} GMAC/s) · rest ${((tot - tk) / N).toFixed(2)} ms`);
