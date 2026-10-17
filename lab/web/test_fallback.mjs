import { readFileSync } from "node:fs";
import { fastEngine } from "./fast.js";
import { Library } from "./codec.js";
const S = "/private/tmp/claude-501/-Users-gulipad-dev-bdebabel/89a1e17a-a03c-4fd3-8953-9067b4c09155/scratchpad/phone/";
const here = (f) => new URL(f, import.meta.url);
const eng = await fastEngine(new Uint8Array(readFileSync(here("./model.bin"))), JSON.parse(readFileSync(here("./model.json"))), readFileSync(here("./engine.wasm")));
const lib = new Library(eng, JSON.parse(readFileSync(S + "library.json")));
// find queries whose canonical form needs the escape slot
const probe = ["ºª°·", "£€$", "zzqqxxjj", "Ÿÿ þ ð", "@#*+="];
for (const q of probe) {
  const items = lib.canonical(" " + q), esc = items.filter((t) => typeof t === "string").length;
  if (!esc) continue;
  const t0 = performance.now(), r = lib.search(q, "a"), addr = lib.pageEncode(r.page), [back] = lib.pageDecode(addr);
  const i = r.page.indexOf(q);
  console.log(`"${q}": ${esc} escaped chars · plain fallback ${!!r.plain} · found at ${i} · ${((performance.now() - t0) / 1000).toFixed(1)}s · reopens: ${back === r.page} · …${r.page.slice(Math.max(0, i - 80), i + q.length + 40).replace(/\n/g, " ")}…`);
}
