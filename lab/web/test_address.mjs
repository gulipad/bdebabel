import { readFileSync } from "node:fs";
import { scramble, unscramble, formatLocation, parseLocation, hexKey } from "./address.js";
const g = JSON.parse(readFileSync("/private/tmp/claude-501/-Users-gulipad-dev-bdebabel/89a1e17a-a03c-4fd3-8953-9067b4c09155/scratchpad/scramble_golden.json"));
const key = hexKey(g.key); let bad = 0;
for (const c of g.cases) {
  const n = BigInt(c.n), s = await scramble(key, n);
  if (s.toString() !== c.s) bad++;
  if ((await unscramble(key, s)) !== n) bad++;
  if (formatLocation("babel-1", s) !== c.loc) bad++;
  if (parseLocation(c.loc)[1] !== s) bad++;
}
console.log(`${g.cases.length} numbers · ${bad === 0 ? "scramble, unscramble, format and parse all identical to Python" : bad + " mismatches"}`);
