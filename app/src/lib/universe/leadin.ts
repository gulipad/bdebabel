/**
 * Search with a real lead-in, for the English Library. The frozen codec's search (Library.prototype.search) drafts
 * the text before the query backwards and stops at the first paragraph start it writes; English opens paragraphs
 * with no dialogue dash to lean on, and with a lowercase query the backward writer often broke the paragraph a word
 * or two before it ("Illo solo i love you", "Tit? I don't know where you are"). This is the same search, rule for
 * rule, with two more: a draft shorter than `minLead` characters is no lead-in, and neither is one holding a token
 * the Library makes remote (the backward writer doesn't apply those penalties: "[182]"). And the seam respects the
 * query's case: one starting in lowercase never follows a full stop, and one starting with a capital follows the end
 * of a sentence or an opening quote (unless it starts with "I", a capital anywhere). The pronoun "i" typed in
 * lowercase is written "I", as English always writes it. A lead-in that ends by echoing the query's opening word
 * ("Tomorrow tomorrow we will go…", "the dark house of the house was empty") is none either. It only uses the frozen Library's own parts, so it changes how
 * search finds a page, never which pages exist, or where.
 */
import type { CodecModule, Library, SearchResult } from './frozen';

type Item = number | string;

/** The parts of the frozen Library (codec.js) the search uses, beyond its public interface. */
interface Parts {
	PAGE: number;
	alphabet: Set<string>;
	t: { vocab: Record<string, number> };
	texts: string[];
	index: Map<number, number>;
	avoid: Uint8Array;
	starts: string;
	bos: number[];
	exp2: number[];
	eng: { pos: number; reset(): void; step(t: number): Int32Array };
	_qz: Int32Array;
	_fz: Int32Array;
	canonical(text: string): Item[];
	idsOf(items: Item[]): number[];
	textOf(items: Item[]): string;
	decode(x: bigint, chars: number): [Item[], bigint];
	decodeOn(x: bigint, chars: number, hist: Item[], z: Int32Array): Item[];
	backward(
		q: number[],
		n: number,
		allowStart: boolean,
		rng: Rng,
		stopAtParagraph: boolean
	): [number[], number, boolean];
	logp(items: Item[], remaining: number, hist: Item[]): number;
	searchPlain(q: string, rng: Rng): SearchResult;
}

interface Rng {
	bits(n: number): bigint;
	below(m: number): number;
}

/** The lead-in ends a sentence (or opens a quote), so what follows starts one. */
const endsSentence = (lead: string) =>
	/[.!?…:]$/.test(lead.trimEnd().replace(/[”’"]+$/, '')) || /[“‘"]$/.test(lead.trimEnd());

/** English writes the pronoun as a capital: "i love you" is searched as "I love you" (i'm, i'll, i've, i'd too). */
const pronoun = (q: string) =>
	q.replace(/(^|[^\p{L}’'])i(?=$|[^\p{L}]|['’](?:m|ll|ve|d)\b)/gu, '$1I');

/** Words of four letters or more, lowercased: the last `n` of a lead-in, or the first `n` of a query. */
const words = (text: string) => text.toLowerCase().match(/\p{L}{4,}/gu) ?? [];
const echoes = (lead: string, q: string) => {
	const tail = words(lead).slice(-3);
	return words(q)
		.slice(0, 2)
		.some((w) => tail.includes(w));
};

const P2 = Array.from({ length: 64 }, (_, k) => 2 ** k);

/** The codec's seeded stream of random BigInts (xorshift32 words), exactly: the same seed, the same draws. */
function bitStream(seed: string): Rng {
	let h = 2166136261 >>> 0;
	for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
	let s = h || 1;
	const word = () => {
		s ^= s << 13;
		s >>>= 0;
		s ^= s >>> 17;
		s ^= s << 5;
		s >>>= 0;
		return s;
	};
	return {
		bits(n) {
			let x = 0n;
			for (let i = 0; i < Math.ceil(n / 32); i++) x = (x << 32n) | BigInt(word());
			return x;
		},
		below(m) {
			return (word() * 2 ** 21 + (word() >>> 11)) % m;
		}
	};
}

export function searchWithLeadIn(
	library: Library,
	codec: CodecModule,
	query: string,
	seed: string,
	{ n = 32, bridge = 96, minLead = 40, scored = 24 } = {}
): SearchResult {
	const L = library as unknown as Parts;
	let [q] = codec.normalize(query, L.alphabet);
	const rng = bitStream(seed + '|' + q.toLowerCase());
	q = ' ' + pronoun(q.trim());
	const letter = q.match(/\p{L}/u)?.[0] ?? '',
		capital = letter !== letter.toLowerCase(),
		either = /^ I\b/.test(q);
	const qToks = L.canonical(q),
		qIds = L.idsOf(qToks);
	const r2l = L.t.vocab['<|r2l|>'];
	const remote = (b: number[]) => b.some((t) => L.avoid[L.index.get(t) ?? 0]);
	for (let attempt = 1; attempt <= 3; attempt++) {
		// a try whose drafts all fell short asks for less on the next: half the lead-in, then none (the case rule stays)
		const least = attempt === 1 ? minLead : attempt === 2 ? minLead / 2 : 0;
		// the start of the page, from the Library, cut at its last paragraph break
		const farChars = rng.below(Math.max(1, L.PAGE - q.length - 4 * bridge));
		let far: Item[] = farChars ? L.decode(rng.bits(farChars * 16 + 64), farChars)[0] : [];
		let cut = 0;
		far.forEach((t, i) => {
			if (typeof t !== 'string' && L.texts[L.index.get(t)!].endsWith('\n')) cut = i + 1;
		});
		far = far.slice(0, cut);
		if (far.some((t) => typeof t === 'string')) far = [];
		// drafts, written backwards from the query (engine prefix shared through rewinds)
		L.eng.reset();
		let z!: Int32Array;
		for (const t of [r2l, ...qIds.slice().reverse()]) z = L.eng.step(t);
		const qPos = L.eng.pos;
		L._qz = Int32Array.from(z);
		const drafts: [number[], number, boolean][] = [];
		for (let i = 0; i < n; i++) {
			L.eng.pos = qPos;
			drafts.push(L.backward(qIds, bridge, far.length === 0, rng, far.length > 0));
		}
		// the far part, then each draft's probability under the Library (rewinding to the end of the far part)
		L.eng.reset();
		for (const t of L.bos.concat(far as number[])) z = L.eng.step(t);
		const fPos = L.eng.pos;
		L._fz = Int32Array.from(z);
		const farText = L.textOf(far),
			parts: [number, number, number[]][] = [];
		let rejected = 0;
		for (const [b, logq, joined] of drafts) {
			const lead = L.textOf(b);
			const seam = either || (capital ? endsSentence(lead) : !endsSentence(lead));
			if (!joined || lead.trim().length < least || remote(b) || !seam || echoes(lead, q)) {
				rejected++;
				continue;
			}
			const first = L.textOf([...b, ...qToks]).replace(/^ +/, '');
			if (!first || !(first[0] !== first[0].toLowerCase() || L.starts.includes(first[0]))) {
				rejected++;
				continue;
			}
			const headText = farText + L.textOf(b);
			const canon = L.canonical(headText + q).slice(0, far.length + b.length);
			const head = [...far, ...b];
			if (canon.length !== head.length || canon.some((t, i) => t !== head[i])) {
				rejected++;
				continue;
			}
			if (headText.length + q.length > L.PAGE) {
				rejected++;
				continue;
			}
			L.eng.pos = fPos;
			// weighed on the lead-in and the query's first `scored` items: where the two meet decides the weight, and the
			// rest of a long query barely depends on what led into it (scoring all of a 120-token query, 18 times, took
			// ~10 s of a search)
			parts.push([
				L.logp([...b, ...qToks.slice(0, scored)], L.PAGE - farText.length, far),
				logq,
				b
			]);
		}
		if (!parts.length) continue;
		// weights p/q in integers: log2 Q16 -> Q12 -> the shipped Q31 2^-f table; one integer draw
		const lw = parts.map(([lp, lq]) => lp - lq),
			m = Math.max(...lw);
		const w = lw.map((v) => {
			const u = Math.floor((m - v) / 16),
				sh = Math.floor(u / 4096);
			return sh >= 32 ? 0 : Math.floor(L.exp2[u % 4096] / P2[sh]);
		});
		const W = w.reduce((a, c) => a + c, 0);
		let u = rng.below(W),
			k = 0;
		while (u >= w[k]) {
			u -= w[k];
			k++;
		}
		const head = [...far, ...parts[k][2], ...qToks],
			used = L.textOf(head).length;
		L.eng.pos = fPos;
		z = L._fz;
		for (const t of [...parts[k][2], ...qIds]) z = L.eng.step(t);
		const after = L.decodeOn(
			rng.bits(L.PAGE * 16),
			L.PAGE - used,
			[...far, ...parts[k][2], ...qIds],
			z
		);
		const page = L.textOf(head) + L.textOf(after);
		const ess = (W * W) / w.reduce((a, c) => a + c * c, 0);
		return {
			page,
			offset: used - q.length + 1,
			attempts: attempt,
			drafts: parts.length,
			rejected,
			ess: Math.round(ess * 100) / 100
		};
	}
	return L.searchPlain(q, rng); // only if no draft made a lead-in in 3 tries (rare)
}
