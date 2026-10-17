import { readFileSync } from "node:fs";
import { fastEngine } from "./fast.js";
import { Library } from "./codec.js";
const S = "/private/tmp/claude-501/-Users-gulipad-dev-bdebabel/89a1e17a-a03c-4fd3-8953-9067b4c09155/scratchpad/phone/";
const here = (f) => new URL(f, import.meta.url);
const eng = await fastEngine(new Uint8Array(readFileSync(here("./model.bin"))), JSON.parse(readFileSync(here("./model.json"))), readFileSync(here("./engine.wasm")));
const lib = new Library(eng, JSON.parse(readFileSync(S + "library.json")));
const around = (p, q, w = 200) => { const i = p.toLowerCase().indexOf(q.toLowerCase()); return (p.slice(Math.max(0, i - w), i) + "【" + p.slice(i, i + q.length) + "】" + p.slice(i + q.length, i + q.length + 90)).replace(/\n\n/g, " ¶ ").replace(/\n/g, " "); };
const N = Number(process.argv[2] || 8);
for (const q of ["te quiero", "el tren de las seis", "tenía miedo de la oscuridad", "no lo sé"]) {
  const t0 = performance.now(); let r;
  try { r = lib.search(q, "a", { n: N }); } catch (e) { console.log(q, "→", e.message); continue; }
  const dt = (performance.now() - t0) / 1000;
  const t1 = performance.now(); const addr = lib.pageEncode(r.page); const [back] = lib.pageDecode(addr);
  console.log(`[${q}] ${dt.toFixed(1)}s · drafts ${r.drafts} (rejected ${r.rejected}, tries ${r.attempts}, ESS ${r.ess}) · address ${addr.toString(2).length} bits, reopens: ${back === r.page} (${((performance.now() - t1) / 1000).toFixed(1)}s)\n   …${around(r.page, q)}…`);
}
