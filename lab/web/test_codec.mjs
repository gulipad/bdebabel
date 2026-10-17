// Round trip: random address -> page -> address; the page's canonical address must give the page back.
import { readFileSync } from "node:fs";
import { fastEngine } from "./fast.js";
import { Library, randomAddress } from "./codec.js";
const S = "/private/tmp/claude-501/-Users-gulipad-dev-bdebabel/89a1e17a-a03c-4fd3-8953-9067b4c09155/scratchpad/phone/";
const here = (f) => new URL(f, import.meta.url);
const eng = await fastEngine(new Uint8Array(readFileSync(here("./model.bin"))), JSON.parse(readFileSync(here("./model.json"))), readFileSync(here("./engine.wasm")));
const lib = new Library(eng, JSON.parse(readFileSync(S + "library.json")));
for (const seed of ["uno", "dos", "tres"]) {
  let t = performance.now();
  const n = randomAddress(seed); const [text, rest] = lib.pageDecode(n); const td = (performance.now() - t) / 1000;
  t = performance.now(); const back = lib.pageEncode(text); const te = (performance.now() - t) / 1000;
  t = performance.now(); const [again] = lib.pageDecode(back); const t2 = (performance.now() - t) / 1000;
  console.log(`seed ${seed}: decode ${td.toFixed(1)}s · ${text.length} chars · address ${n.toString(2).length} bits, canonical ${back.toString(2).length} bits (encode ${te.toFixed(1)}s) · canonical address opens the same page: ${again === text} (${t2.toFixed(1)}s)`);
  if (seed === "uno") console.log("   " + text.slice(0, 400).replace(/\n/g, " ¶ ") + "…");
}
