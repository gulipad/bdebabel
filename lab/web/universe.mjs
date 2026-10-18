// Universe tool for the integer Library (babel-1 and successors). A universe is a frozen folder:
//   lab/universes/<id>/manifest.json   id, settings, scramble key, every file's SHA-256, fixtures
//   lab/universes/<id>/model/          model.bin, model.json, library.json, engine.wasm
//   lab/universes/<id>/engine/         the exact engine and codec sources (engine.wat, fast.js, codec.js, bpe.js, address.js)
// Its addresses are "<id>:<hexágono>:<muro>:<anaquel>:<volumen>:<página>" and must open the same page forever.
//
//   node lab/web/universe.mjs freeze babel-1 "<description>"   (from lab/web, exported from $MODEL, default lab/models/librarian-1)
//   node lab/web/universe.mjs verify babel-1
//   node lab/web/universe.mjs page babel-1 <address | random [seed]>
//   node lab/web/universe.mjs search babel-1 "<sentence>" [seed]
//   node lab/web/universe.mjs rings babel-1 [pages]            (measures distances; writes rings.json)
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, chmodSync, existsSync, statSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, "..", "..");
const SCRATCH = "/private/tmp/claude-501/-Users-gulipad-dev-bdebabel/89a1e17a-a03c-4fd3-8953-9067b4c09155/scratchpad/phone";
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const shaText = (t) => createHash("sha256").update(t, "utf8").digest("hex");
const ENGINE = ["engine.wat", "fast.js", "codec.js", "bpe.js", "address.js"];
// the model lab/web/model.bin was exported from (lab/int_engine.py export <folder> lab/web)
const MODEL = process.env.MODEL || "lab/models/librarian-1", MODEL_NAME = MODEL.split("/").pop();

async function open(uid) {
  const d = join(ROOT, "lab/universes", uid), m = JSON.parse(readFileSync(join(d, "manifest.json")));
  for (const [rel, h] of Object.entries(m.files)) if (sha(join(d, rel)) !== h) throw new Error(`${rel} does not match the manifest`);
  const { fastEngine } = await import(join(d, "engine/fast.js"));
  const { Library } = await import(join(d, "engine/codec.js"));
  const A = await import(join(d, "engine/address.js"));
  const eng = await fastEngine(new Uint8Array(readFileSync(join(d, "model/model.bin"))), JSON.parse(readFileSync(join(d, "model/model.json"))), readFileSync(join(d, "model/engine.wasm")));
  const lib = new Library(eng, JSON.parse(readFileSync(join(d, "model/library.json"))), m.settings);
  const key = A.hexKey(m.scramble_key);
  return { d, m, lib, A, key,
    address: (n) => A.addressOf(m.id, key, n),
    number: (addr) => A.numberOf(m.id, key, addr) };
}

function randomNumber(seed, chars) {  // a random codec number for a seed: SHA-256 in counter mode
  let x = 0n; const bits = chars * 16;
  for (let i = 0; i * 256 < bits; i++) x = (x << 256n) | BigInt("0x" + createHash("sha256").update(`${seed}:${i}`).digest("hex"));
  return x >> BigInt(Math.ceil(bits / 256) * 256 - bits);
}

async function freeze(uid, description) {
  const d = join(ROOT, "lab/universes", uid);
  if (existsSync(join(d, "manifest.json"))) throw new Error(`${uid} is already frozen`);
  mkdirSync(join(d, "model"), { recursive: true }); mkdirSync(join(d, "engine"), { recursive: true });
  for (const f of ["model.bin", "model.json"]) copyFileSync(join(HERE, f), join(d, "model", f));
  copyFileSync(join(HERE, "engine.wasm"), join(d, "model/engine.wasm"));
  copyFileSync(join(SCRATCH, "library.json"), join(d, "model/library.json"));
  for (const f of ENGINE) copyFileSync(join(HERE, f), join(d, "engine", f));
  const { BABEL1 } = await import(join(d, "engine/codec.js"));
  const files = {};
  for (const f of ["model/model.bin", "model/model.json", "model/engine.wasm", "model/library.json", ...ENGINE.map((f) => "engine/" + f)]) files[f] = sha(join(d, f));
  const m = {
    id: uid, description, frozen: new Date().toISOString(),
    status: "integer engine: bit-exact on any device (numpy reference lab/int_engine.py, browser WebAssembly)",
    source_model: { name: MODEL_NAME, folder: MODEL, sha256: sha(join(ROOT, MODEL, "model.safetensors")) },
    engine: "int8-1", codec: "rans-int-1", address: "b62-feistel-1", page_chars: 3200,
    settings: BABEL1, scramble_key: randomBytes(32).toString("hex"), files, fixtures: [],
  };
  writeFileSync(join(d, "manifest.json"), JSON.stringify(m, null, 1));
  const u = await open(uid);
  const center = u.lib.pageDecode(0n)[0];
  m.fixtures.push({ kind: "center", number: "0", address: await u.address(0n), sha256: shaText(center), bits: 0, text_start: center.slice(0, 160) });
  for (const seed of ["fixture-0", "fixture-1"]) {
    const [text] = u.lib.pageDecode(randomNumber(seed, 3200)), n = u.lib.pageEncode(text);
    m.fixtures.push({ kind: "random", seed, address: await u.address(n), sha256: shaText(text), bits: n.toString(2).length });
  }
  const q = ["Hoy me desperté pensando en ti, y en la biblioteca infinita.", "0"], r = u.lib.search(q[0], q[1]), n = u.lib.pageEncode(r.page);
  m.fixtures.push({ kind: "search", query: q[0], seed: q[1], address: await u.address(n), sha256: shaText(r.page), bits: n.toString(2).length });
  writeFileSync(join(d, "manifest.json"), JSON.stringify(m, null, 1));
  for (const f of [...Object.keys(files), "manifest.json"]) chmodSync(join(d, f), 0o444);
  console.log(`froze ${uid} · ${Object.keys(files).length} files · center: "${center.slice(0, 80).replace(/\n/g, " ")}…"`);
}

async function verify(uid) {
  const u = await open(uid); let ok = true;
  for (const f of u.m.fixtures) {
    let text;
    if (f.kind === "search") text = u.lib.search(f.query, f.seed).page;
    else text = u.lib.pageDecode(await u.number(f.address))[0];
    const good = shaText(text) === f.sha256 && (f.kind === "center" || (await u.address(u.lib.pageEncode(text))) === f.address);
    ok &&= good;
    console.log(`${good ? "ok  " : "FAIL"} ${f.kind.padEnd(6)} ${f.address.slice(0, 48)}…`);
  }
  console.log(ok ? `${uid}: all fixtures reproduce` : `${uid}: FIXTURES DO NOT REPRODUCE`);
  if (!ok) process.exitCode = 1;
}

async function rings(uid, pages) {
  const u = await open(uid), bits = [];
  for (let i = 0; i < pages; i++) {
    const [text] = u.lib.pageDecode(randomNumber(`rings-${i}`, 3200));
    bits.push(u.lib.pageEncode(text).toString(2).length);
    if ((i + 1) % 10 === 0) console.log(`${i + 1}/${pages} pages measured`);
  }
  bits.sort((a, b) => a - b);
  const q = (p) => bits[Math.min(bits.length - 1, Math.floor(p * bits.length))];
  const out = { universe: uid, pages, percentiles: { p1: q(0.01), p10: q(0.1), p50: q(0.5), p90: q(0.9), p99: q(0.99) },
    rings: [ { name: "El Centro", until: q(0.01) }, { name: "Los Barrios", until: q(0.99) },
             { name: "Las Afueras", until: 2 * q(0.99) }, { name: "Los Confines", until: 8 * q(0.99) }, { name: "El Vacío", until: null } ],
    note: "Boundaries from the distances of pages opened at random addresses: the 1% nearest are the center, the middle 98% the neighbourhoods where browsing lands; beyond, text the Library finds increasingly unlikely." };
  writeFileSync(join(u.d, "rings.json"), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out.percentiles));
}

const [cmd, uid, a, b] = process.argv.slice(2);
if (cmd === "freeze") await freeze(uid, a || "");
else if (cmd === "verify") await verify(uid);
else if (cmd === "rings") await rings(uid, Number(a || 100));
else if (cmd === "page") {
  const u = await open(uid);
  const n = a === "random" || !a ? randomNumber(b || String(Date.now()), 3200) : await u.number(a);
  const [text] = u.lib.pageDecode(n), c = u.lib.pageEncode(text);
  console.log(text + `\n\n— ${await u.address(c)} · ${c.toString(2).length} bits from the center`);
} else if (cmd === "search") {
  const u = await open(uid), r = u.lib.search(a, b || String(Date.now())), c = u.lib.pageEncode(r.page);
  console.log(r.page + `\n\n— ${await u.address(c)} · ${c.toString(2).length} bits from the center`);
} else console.log("usage: freeze | verify | page | search | rings");
