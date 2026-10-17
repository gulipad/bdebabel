import { readFileSync } from "node:fs";
import { makeBPE } from "./bpe.js";
const S = "/private/tmp/claude-501/-Users-gulipad-dev-bdebabel/89a1e17a-a03c-4fd3-8953-9067b4c09155/scratchpad/phone/";
const lib = JSON.parse(readFileSync(S + "library.json")), g = JSON.parse(readFileSync(S + "bpe_golden.json"));
const bpe = makeBPE(lib.vocab, lib.merges);
let bad = 0;
g.texts.forEach((t, i) => { const a = bpe.encode(t), b = g.ids[i]; if (a.length !== b.length || a.some((x, j) => x !== b[j])) { if (!bad) console.log("first mismatch:", JSON.stringify(t.slice(0, 80))); bad++; } });
console.log(`${g.texts.length} texts · ${bad === 0 ? "ALL token ids identical to the Python tokenizer" : bad + " differ"}`);
