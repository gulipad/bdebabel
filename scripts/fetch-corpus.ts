// Downloads the most popular Spanish-language public-domain books from Project Gutenberg
// into corpus/raw/. Usage: npm run corpus [-- <maxBooks>]
import { mkdir, writeFile, readdir } from "node:fs/promises";

const MAX_BOOKS = Number(process.argv[2] ?? 30);
const OUT = new URL("../corpus/raw/", import.meta.url);

type Book = { id: number; title: string; languages: string[]; formats: Record<string, string> };

await mkdir(OUT, { recursive: true });
const have = new Set(await readdir(OUT));
const books: Book[] = [];
let next: string | null = "https://gutendex.com/books/?languages=es&sort=popular";
while (next && books.length < MAX_BOOKS) {
  const page = (await (await fetch(next)).json()) as { next: string | null; results: Book[] };
  for (const b of page.results) {
    // Spanish-only books, so the model learns one language.
    if (b.languages.length === 1 && b.languages[0] === "es" && books.length < MAX_BOOKS) books.push(b);
  }
  next = page.next;
}

for (const b of books) {
  const file = `${b.id}.txt`;
  if (have.has(file)) continue;
  const url = Object.entries(b.formats).find(([type]) => type.startsWith("text/plain"))?.[1];
  if (!url) continue;
  const res = await fetch(url);
  if (!res.ok) { console.warn(`skip ${b.id}: HTTP ${res.status}`); continue; }
  const text = await res.text();
  await writeFile(new URL(file, OUT), text);
  console.log(`${String(b.id).padStart(6)}  ${(text.length / 1e6).toFixed(2)} MB  ${b.title}`);
}
