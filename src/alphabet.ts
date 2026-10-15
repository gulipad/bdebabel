// The Library's alphabet. Changing it changes the universe: every address moves.
// Lowercase only, as in Borges; no digits (the Library has none).

export const LETTERS = "abcdefghijklmnopqrstuvwxyzñáéíóúü";
export const PUNCTUATION = " .,;:¿?¡!—()«»";
export const ALPHABET = LETTERS + PUNCTUATION;
export const A = ALPHABET.length;

export const PAGE_LINES = 40;
export const LINE_CHARS = 80;
export const PAGE_CHARS = PAGE_LINES * LINE_CHARS; // 3200

const INDEX = new Map<string, number>([...ALPHABET].map((c, i) => [c, i]));

export function indexOf(c: string): number {
  const i = INDEX.get(c);
  if (i === undefined) throw new Error(`character outside the alphabet: ${JSON.stringify(c)}`);
  return i;
}

const REPLACEMENTS: Record<string, string> = {
  "“": "«", "”": "»", '"': "«", "‘": "", "’": "", "'": "",
  "–": "—", "-": "—", "―": "—", "[": "(", "]": ")", "{": "(", "}": ")",
  "à": "á", "è": "é", "ì": "í", "ò": "ó", "ù": "ú",
  "â": "á", "ê": "é", "î": "í", "ô": "ó", "û": "ú",
  "ç": "c", "ï": "i", "ë": "e", "…": "...",
};

/**
 * Bring arbitrary text into the alphabet: lowercase, NFC, map typographic variants,
 * drop anything else, collapse whitespace. "«Él dijo: 'hola'»" -> "«él dijo: hola»".
 */
export function normalize(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFC").toLowerCase()) {
    const c = REPLACEMENTS[ch] ?? ch;
    if (/\s/.test(c)) out += " ";
    else for (const k of c) if (INDEX.has(k)) out += k;
  }
  return out.replace(/ {2,}/g, " ");
}
