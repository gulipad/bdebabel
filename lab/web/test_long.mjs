import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fastEngine } from "./fast.js";
const here = (f) => new URL(f, import.meta.url);
const g = JSON.parse(readFileSync(here("./golden_long.json")));
const eng = await fastEngine(new Uint8Array(readFileSync(here("./model.bin"))), JSON.parse(readFileSync(here("./model.json"))), readFileSync(here("./engine.wasm")));
let bad = 0;
for (let i = 0; i < g.tokens.length; i++) {
  const z = eng.step(g.tokens[i]);
  const h = createHash("sha256").update(Buffer.from(Int32Array.from(z).buffer)).digest("hex");
  if (h !== g.sha256[i]) { if (!bad) console.log("first mismatch at position", i); bad++; }
}
console.log(`${g.tokens.length} positions · ${bad === 0 ? "ALL identical to numpy" : bad + " differ"}`);
