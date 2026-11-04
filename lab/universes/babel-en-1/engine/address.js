// Addresses people see: a keyed, length-preserving shuffle of the codec number (lab/scramble.py, byte for byte)
// written as <universe>:<hexágono base 62>:<muro 1-4>:<anaquel 1-5>:<volumen 1-32>:<página 1-410> (lab/universe.py).
// Neighbouring locations open unrelated pages; a location and its page always have the same bit length.
const ROUNDS = 6, B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const bitLength = (n) => (n === 0n ? 0 : n.toString(2).length);

function toBytes(x) {  // big-endian, minimal length (at least 1 byte), as Python's int.to_bytes
  let h = x.toString(16); if (h.length % 2) h = "0" + h;
  const b = new Uint8Array(h.length / 2);
  for (let i = 0; i < b.length; i++) b[i] = parseInt(h.substr(2 * i, 2), 16);
  return b;
}
function cat(...parts) { const n = parts.reduce((a, p) => a + p.length, 0), out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; }
const u32be = (i) => new Uint8Array([(i >>> 24) & 255, (i >>> 16) & 255, (i >>> 8) & 255, i & 255]);

async function prf(key, rnd, width, x) {
  if (width === 0) return 0n;
  const data = cat(new Uint8Array([(rnd >> 8) & 255, rnd & 255]), toBytes(x));
  let out = new Uint8Array(0), i = 0;
  while (out.length * 8 < width) { out = cat(out, new Uint8Array(await crypto.subtle.digest("SHA-256", cat(key, u32be(i), data)))); i++; }
  let v = 0n; for (const b of out) v = (v << 8n) | BigInt(b);
  return v >> BigInt(out.length * 8 - width);
}
async function feistel(key, n, bits, inverse) {
  if (bits <= 1) return n;
  const aBits = Math.floor(bits / 2), bBits = bits - aBits, mask = (1n << BigInt(bBits)) - 1n;
  let left = n >> BigInt(bBits), right = n & mask;
  const rounds = [...Array(ROUNDS).keys()]; if (inverse) rounds.reverse();
  for (const r of rounds) {
    if (r % 2 === 0) left ^= await prf(key, r, aBits, right);
    else right ^= await prf(key, r, bBits, left);
  }
  return (left << BigInt(bBits)) | right;
}
export async function scramble(key, n) {
  const k = bitLength(n); if (k <= 1) return n;
  const top = 1n << BigInt(k - 1);
  return top | await feistel(key, n - top, k - 1, false);
}
export async function unscramble(key, loc) {
  const k = bitLength(loc); if (k <= 1) return loc;
  const top = 1n << BigInt(k - 1);
  return top | await feistel(key, loc - top, k - 1, true);
}
export function formatLocation(uid, loc) {
  const coords = [];
  for (const k of [410n, 32n, 5n, 4n]) { coords.push(Number(loc % k) + 1); loc /= k; }
  let h = ""; do { h = B62[Number(loc % 62n)] + h; loc /= 62n; } while (loc > 0n);
  const [page, volume, shelf, wall] = coords;
  return `${uid}:${h}:${wall}:${shelf}:${volume}:${page}`;
}
export function parseLocation(addr) {
  const [uid, hexagon, ...coords] = addr.trim().split(":");
  if (coords.length !== 4) throw new Error("an address has six parts: universe:hexágono:muro:anaquel:volumen:página");
  const [wall, shelf, volume, page] = coords.map(Number);
  let loc = 0n;
  for (const ch of hexagon) { const v = B62.indexOf(ch); if (v < 0) throw new Error(`unexpected character '${ch}' in the hexágono`); loc = loc * 62n + BigInt(v); }
  for (const [v, k] of [[wall, 4], [shelf, 5], [volume, 32], [page, 410]]) {
    if (!(Number.isInteger(v) && v >= 1 && v <= k)) throw new Error(`coordinate ${v} out of range 1..${k}`);
    loc = loc * BigInt(k) + BigInt(v - 1);
  }
  return [uid, loc];
}
export const hexKey = (hex) => Uint8Array.from(hex.match(/../g), (b) => parseInt(b, 16));
export async function addressOf(uid, key, n) { return formatLocation(uid, await scramble(key, n)); }
export async function numberOf(uid, key, addr) {
  const [u, loc] = parseLocation(addr);
  if (u !== uid) throw new Error(`this address belongs to ${u}, not ${uid}`);
  return unscramble(key, loc);
}
