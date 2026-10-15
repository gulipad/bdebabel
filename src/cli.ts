// npm run babel -- random [seed]
// npm run babel -- search "texto a buscar" [seed]
// npm run babel -- page <hexágono:muro:anaquel:volumen:página>
// Add --full to print the whole hexagon name.
import { readFile } from "node:fs/promises";
import { deserialize } from "./model.ts";
import { addressOf, pageAt, randomPage, search, type Page } from "./library.ts";
import { formatAddress, parseAddress } from "./address.ts";
import { LINE_CHARS } from "./alphabet.ts";

const args = process.argv.slice(2).filter((a) => a !== "--full");
const full = process.argv.includes("--full");
const [cmd, arg, seed] = args;

const model = deserialize(new Uint8Array(await readFile(new URL("../model/model.bin", import.meta.url))));

function wrap(text: string): string {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && line.length + 1 + word.length > LINE_CHARS) { lines.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  return [...lines, line].join("\n");
}

function show(p: Page, note = "") {
  const a = p.address;
  const hex = full || a.hexagon.length <= 40 ? a.hexagon : `${a.hexagon.slice(0, 24)}…${a.hexagon.slice(-8)}`;
  console.log(wrap(p.text));
  console.log("\n" + "─".repeat(LINE_CHARS));
  console.log(`hexágono ${hex}  (${a.hexagon.length} caracteres)`);
  console.log(`muro ${a.wall} · anaquel ${a.shelf} · volumen ${a.volume} · página ${a.page}`);
  console.log(`${p.bits} bits  (una página uniforme necesitaría ${Math.ceil(3200 * Math.log2(47))})${note}`);
}

const t0 = performance.now();
switch (cmd) {
  case "random":
    show(randomPage(model, arg));
    break;
  case "search": {
    const p = search(model, arg, seed);
    // Prove the round trip: the address really leads back to this page.
    const back = pageAt(model, p.address);
    if (back.text !== p.text || !back.canonical) throw new Error("round trip failed");
    show(p, `\nconsulta en el carácter ${p.offset}, semilla ${seed ?? "0"} · ida y vuelta verificada`);
    break;
  }
  case "page": {
    const p = pageAt(model, parseAddress(arg));
    show(p, p.canonical ? "" : `\n(dirección no canónica: esta página está catalogada en ${formatAddress(addressOf(model, p.text).address).slice(0, 32)}…)`);
    break;
  }
  default:
    console.log("usage: random [seed] | search <text> [seed] | page <address> [--full]");
    process.exit(1);
}
console.error(`\n${((performance.now() - t0) / 1000).toFixed(2)}s`);
