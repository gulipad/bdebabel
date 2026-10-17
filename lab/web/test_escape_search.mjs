import { readFileSync } from "node:fs";
import { fastEngine } from "./fast.js";
import { Library } from "./codec.js";
const here = (f) => new URL(f, import.meta.url);
const eng = await fastEngine(new Uint8Array(readFileSync(here("./model.bin"))), JSON.parse(readFileSync(here("./model.json"))), readFileSync(here("./engine.wasm")));
const lib = new Library(eng, JSON.parse(readFileSync("/Users/gulipad/dev/bdebabel/lab/universes/babel-1/model/library.json")));
for (const q of ["la PEÑA del ÚLTIMO día", "costaba 100 € al mes", "el pingüino de Ñuñoa", "te quiero"]) {
  const t0 = performance.now(), r = lib.search(q, "a"), dt = (performance.now() - t0) / 1000;
  const addr = lib.pageEncode(r.page), [back] = lib.pageDecode(addr), i = r.page.indexOf(q);
  console.log(`[${q}] ${dt.toFixed(1)}s · plain fallback: ${!!r.plain} · drafts ${r.drafts} · reopens: ${back === r.page} · …${r.page.slice(Math.max(0, i - 120), i + q.length + 60).replace(/\n/g, " ")}…`);
}
