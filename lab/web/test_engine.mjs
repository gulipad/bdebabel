// node test_engine.mjs: the JS engine must reproduce the numpy reference's logits exactly.
import { readFileSync } from "node:fs";
import { Engine } from "./engine.js";
const bin = readFileSync(new URL("./model.bin", import.meta.url));
const buf = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
const index = JSON.parse(readFileSync(new URL("./model.json", import.meta.url)));
const golden = JSON.parse(readFileSync(new URL("./golden.json", import.meta.url)));
const eng = new Engine(buf, index);
const n = Number(process.argv[2] || golden.tokens.length);
let mism = 0, t0 = performance.now();
for (let i = 0; i < n; i++) {
  const z = eng.step(golden.tokens[i]), g = golden.logits[i];
  let bad = 0;
  for (let j = 0; j < z.length; j++) if (z[j] !== g[j]) bad++;
  if (bad) { mism++; if (mism <= 3) console.log(`position ${i}: ${bad} logits differ (e.g. js ${z[0]} vs py ${g[0]})`); }
}
const dt = (performance.now() - t0) / 1000;
console.log(`${n} positions · ${mism === 0 ? "ALL logits identical to the numpy reference" : mism + " positions differ"} · plain JS ${(n / dt).toFixed(1)} tokens/s`);
