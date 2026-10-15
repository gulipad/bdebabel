// The test suite is the spec: if any of these break, the universe has moved.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ALPHABET, PAGE_CHARS, normalize } from "../src/alphabet.ts";
import { deserialize } from "../src/model.ts";
import { addressOf, pageAt, randomPage, search, seeded } from "../src/library.ts";
import { formatAddress, fromAddress, parseAddress, toAddress } from "../src/address.ts";

const GOLDEN_BITS = 4505;
const GOLDEN_HEX_PREFIX = "j7b1ja6aecqbrt6v";
const model = deserialize(new Uint8Array(await readFile(new URL("../model/model.bin", import.meta.url))));

test("address codec is a bijection on integers", () => {
  for (const n of [0n, 1n, 409n, 410n, 262_399n, 262_400n, 2n ** 5000n + 12345n]) {
    const a = toAddress(n);
    assert.equal(fromAddress(a), n);
    assert.deepEqual(parseAddress(formatAddress(a)), a);
  }
});

test("random pages round-trip: page → address → same page", () => {
  for (const seed of ["a", "b", "c"]) {
    const p = randomPage(model, seed);
    assert.equal(p.text.length, PAGE_CHARS);
    const back = pageAt(model, p.address);
    assert.equal(back.text, p.text);
    assert.ok(back.canonical);
  }
});

test("search embeds the query and is reproducible from (query, seed)", () => {
  const q = "En un lugar de la Mancha, de cuyo nombre no quiero acordarme";
  const p = search(model, q, "s");
  assert.ok(p.text.includes(normalize(q)));
  assert.equal(p.text.slice(p.offset, p.offset + normalize(q).length), normalize(q));
  assert.equal(pageAt(model, p.address).text, p.text);
  assert.deepEqual(search(model, q, "s").address, p.address);
  assert.notDeepEqual(search(model, q, "t").address, p.address);
});

test("completeness: pure noise is still in the Library, just far away", () => {
  const rng = seeded("noise");
  const noise = Array.from({ length: PAGE_CHARS }, () => ALPHABET[rng() % ALPHABET.length]).join("");
  const p = addressOf(model, noise);
  assert.equal(pageAt(model, p.address).text, noise);
  assert.ok(p.bits > randomPage(model, "a").bits * 3, "noise should need far more bits than prose");
});

test("a full page of query text round-trips exactly", () => {
  const q = "a".repeat(PAGE_CHARS);
  const p = search(model, q);
  assert.equal(p.text, q);
  assert.equal(pageAt(model, p.address).text, q);
});

test("non-canonical numbers still land on a page", () => {
  const p = randomPage(model, "a");
  const off = toAddress(fromAddress(p.address) + 1n);
  const q = pageAt(model, off);
  assert.equal(q.text.length, PAGE_CHARS);
  assert.equal(pageAt(model, addressOf(model, q.text).address).text, q.text);
});

test("frozen universe: golden fixture", () => {
  // If this fails, the model, alphabet or codec changed and every address moved.
  // Regenerate deliberately and bump the version.
  const p = search(model, "la biblioteca de babel", "golden");
  assert.equal(p.bits, GOLDEN_BITS);
  assert.equal(p.address.hexagon.slice(0, 16), GOLDEN_HEX_PREFIX);
});
