// A page's catalogue number, laid out on Borges's geometry:
// hexágono · muro (1–4) · anaquel (1–5) · volumen (1–32) · página (1–410).

export const WALLS = 4, SHELVES = 5, VOLUMES = 32, PAGES = 410;

export type Address = { hexagon: string; wall: number; shelf: number; volume: number; page: number };

export function toAddress(n: bigint): Address {
  const take = (k: number) => { const r = Number(n % BigInt(k)); n /= BigInt(k); return r + 1; };
  const page = take(PAGES), volume = take(VOLUMES), shelf = take(SHELVES), wall = take(WALLS);
  return { hexagon: n.toString(36), wall, shelf, volume, page };
}

export function fromAddress(a: Address): bigint {
  let n = parseBase36(a.hexagon);
  for (const [v, k] of [[a.wall, WALLS], [a.shelf, SHELVES], [a.volume, VOLUMES], [a.page, PAGES]] as const) {
    if (!Number.isInteger(v) || v < 1 || v > k) throw new Error(`coordinate ${v} out of range 1..${k}`);
    n = n * BigInt(k) + BigInt(v - 1);
  }
  return n;
}

export function formatAddress(a: Address): string {
  return `${a.hexagon}:${a.wall}:${a.shelf}:${a.volume}:${a.page}`;
}

export function parseAddress(s: string): Address {
  const [hexagon, ...rest] = s.trim().split(":");
  const [wall, shelf, volume, page] = rest.map(Number);
  if (!/^[0-9a-z]+$/.test(hexagon) || rest.length !== 4) throw new Error("expected hexagon:wall:shelf:volume:page");
  return { hexagon, wall, shelf, volume, page };
}

function parseBase36(s: string): bigint {
  let n = 0n;
  for (const c of s) n = n * 36n + BigInt(parseInt(c, 36));
  return n;
}
