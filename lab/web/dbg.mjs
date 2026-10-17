import { readFileSync } from "node:fs";
import { fastEngine } from "./fast.js";
import { Library } from "./codec.js";
const here = (f) => new URL(f, import.meta.url);
const eng = await fastEngine(new Uint8Array(readFileSync(here("./model.bin"))), JSON.parse(readFileSync(here("./model.json"))), readFileSync(here("./engine.wasm")));
const lib = new Library(eng, JSON.parse(readFileSync("/Users/gulipad/dev/bdebabel/lab/universes/babel-1/model/library.json")));
const q = " costaba 100 € al mes", items = lib.canonical(q), ids = lib.idsOf(items);
console.log("items:", items.map((t) => (typeof t === "string" ? `ESC(${t})` : JSON.stringify(lib.texts[lib.index.get(t)]))).join(" "));
console.log("model ids:", ids.length, "· canonical(q) of a page text ending in q:", JSON.stringify(lib.canonical("Hola.\n\n" + q.trim()).slice(-6).map((t) => (typeof t === "string" ? "ESC" + t : lib.texts[lib.index.get(t)]))));
// what does canonical do around "100 €"?
const text = "Era caro: costaba 100 € al mes";
console.log("bpe ids of ' €':", lib.bpe.encode(" €"), "in printable vocab?", lib.bpe.encode(" €").map((t) => lib.index.has(t)));
