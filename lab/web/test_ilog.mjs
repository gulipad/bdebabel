import { readFileSync } from "node:fs";
const t = JSON.parse(readFileSync("/private/tmp/claude-501/-Users-gulipad-dev-bdebabel/89a1e17a-a03c-4fd3-8953-9067b4c09155/scratchpad/phone/library.json"));
const src = readFileSync(new URL("./codec.js", import.meta.url), "utf8");
const fn = new Function("L", src.slice(src.indexOf("function ilog2q16"), src.indexOf("export const BABEL1")) + "; return ilog2q16;")();
let worst = 0;
for (const n of [1, 2, 3, 4095, 4096, 4097, 123456789, 2 ** 31 - 1, 2 ** 31, 2 ** 40 + 7, 2 ** 52 + 3, 2 ** 45 * 3]) { const e = Math.abs(fn(n, t.log2_q16) / 65536 - Math.log2(n)); if (e > worst) worst = e; }
console.log("ilog2 max error:", worst.toExponential(2), "bits (table resolution 2^-12 ≈ 3.5e-4)");
