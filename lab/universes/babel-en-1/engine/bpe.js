// Byte-level BPE (GPT-2 / Hugging Face ByteLevelBPETokenizer, no prefix space): the same pre-tokenization
// regex and merge ranks, so it reproduces the Python tokenizer's ids exactly (test_bpe.mjs checks this).
const PAT = /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;

function bytesToUnicode() {
  const bs = [];
  for (let i = 33; i <= 126; i++) bs.push(i);
  for (let i = 161; i <= 172; i++) bs.push(i);
  for (let i = 174; i <= 255; i++) bs.push(i);
  const cs = bs.slice(); let n = 0;
  for (let b = 0; b < 256; b++) if (!bs.includes(b)) { bs.push(b); cs.push(256 + n); n++; }
  const m = {}; bs.forEach((b, i) => { m[b] = String.fromCharCode(cs[i]); });
  return m;
}

export function makeBPE(vocab, merges) {
  const b2u = bytesToUnicode(), enc = new TextEncoder();
  const ranks = new Map(merges.map((m, i) => [m, i]));
  const cache = new Map();
  function bpe(word) {
    if (cache.has(word)) return cache.get(word);
    let parts = Array.from(word);
    while (parts.length > 1) {
      let best = -1, bestRank = Infinity;
      for (let i = 0; i < parts.length - 1; i++) {
        const r = ranks.get(parts[i] + " " + parts[i + 1]);
        if (r !== undefined && r < bestRank) { bestRank = r; best = i; }
      }
      if (best < 0) break;
      const a = parts[best], b = parts[best + 1], merged = [];
      for (let i = 0; i < parts.length; i++) {
        if (i < parts.length - 1 && parts[i] === a && parts[i + 1] === b) { merged.push(a + b); i++; }
        else merged.push(parts[i]);
      }
      parts = merged;
    }
    const ids = parts.map((p) => vocab[p]);
    cache.set(word, ids);
    return ids;
  }
  const piece = (s) => bpe(Array.from(enc.encode(s), (b) => b2u[b]).join(""));
  return {
    encode(text) {
      const out = [];
      for (const m of text.matchAll(PAT)) for (const id of piece(m[0])) out.push(id);
      return out;
    },
    /** The pre-tokenizer's pieces of text, each with its BPE ids: [[pieceText, ids], ...]. */
    pieces(text) { return Array.from(text.matchAll(PAT), (m) => [m[0], piece(m[0])]); },
  };
}
