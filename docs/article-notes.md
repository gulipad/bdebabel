# Article notes: the math and philosophy of bdebabel

Raw material for an article about this project. Organized by theme, with the numbers we
measured and the experiments that taught us something. Kept up to date as the project moves.

Last updated: 2026-10-18. Universes: `babel-1` (our own 66M model, integer engine, runs on any device; being prepared for release) and `babel-exp-1` (the earlier experiment with stock GPT-2 Spanish, float, never released; measurements marked `babel-exp-1` come from it).

---

## 1. Premise

- **Borges, "La biblioteca de Babel" (1941).** A universe of hexagonal galleries; each hexagon
  has 4 walls of shelves, 5 shelves per wall, 32 books per shelf, 410 pages per book, 40 lines
  of ~80 characters per page, over 25 symbols. It contains every possible book. Its librarians
  despair because meaning is vanishingly rare among gibberish. The narrator insists no two books
  are identical.
- **Basile, libraryofbabel.info (2015).** Makes it real with arithmetic, not storage: every
  possible *page* of 3,200 characters over 29 symbols (a–z, space, comma, period), about
  29³²⁰⁰ ≈ 10⁴⁶⁸⁰ pages. An invertible scrambling function maps a location
  (hexagon · wall · shelf · volume · page) to a page and back. Nothing is stored. Search pads
  your text (with spaces, random characters or random English words) and inverts the function.
  Hexagon names are ~3,000 base-36 characters.
- **This project.** A Library of Babel in Spanish, for the 21st century: a language model
  decides how the shelves are weighted. Every page still exists; natural Spanish is common and
  gibberish is remote.

## 2. The core mechanism: a language model as cartographer

- A language model gives, at each step, the probability of every possible next token.
- **Arithmetic coding / rANS** turns those probabilities into an exact, invertible map between
  numbers and texts. One decode step is a bijection ℕ ⟷ Σ × ℕ:
  `decode(x) = (s, f_s·⌊x/T⌋ + (x mod T) − cum_s)`. Chaining ~800 steps maps a number to a page
  plus a leftover number.
- **Intuition: dice rolls.** The model is a writer who rolls a die at every word. The address is
  the list of rolls, packed into one number. Browsing = unpack the rolls and let the model write.
  Searching = ask, at each word, which roll would have produced it. Same rolls, same page,
  forever, because the model is frozen.
- **Search and browse are two readings of one fixed map.** Nested intervals: the number line is
  split by the first word's probabilities, each slice split again by the next word, and so on.
  Every page is one nested slice. Browsing finds the slice a number falls in; searching measures
  where a text's slice is.
- The randomness of "generation" lives entirely in the address. Given the address, nothing is
  random.

## 3. Information theory of addresses

- **Address length = surprisal.** A page costs about −log₂ P(page) bits. Likely pages get short
  addresses; unlikely ones long addresses. The address is the page, compressed.
- **Pigeonhole.** No library of everything can give every page a short name: there are more
  texts than short names. Basile's addresses are as long as the information in a page; ours
  are as long as what the model *can't predict* about the page.
- **Measured (universe `babel-exp-1`):** a typical page costs ~2,200 bits (1,900–2,400), ~375
  characters in base 62. Basile: ~15,500 bits, ~3,000 characters. **About 8× shorter.**
- Gibberish costs *more* than in Basile's Library (20,000+ bits). We spend the short addresses on
  the pages people visit.
- **What typed text costs** (bits under `babel-exp-1`): *test* 33 · *Te quiero* 64 · *Gonzalo
  Martínez Ruiz* 97 · *Mañana a las ocho en la puerta del Retiro.* 116 · *Hoy me desperté
  pensando en ti, y en la biblioteca infinita.* 185 · first sentence of the Quijote 313.
  Predictability matters more than length: a common phrase is cheap, a name is expensive,
  `xq7#zz` is very expensive.
- **The safety net (built).** The Library is a mixture: the first roll of every page chooses the
  model (all but 1 in 2²⁰) or a simple character-by-character writer weighted toward Spanish.
  Every page gets a probability floor, so the worst-case address is bounded. Measured:
  Basile-style gibberish costs 19,460 bits (~3,270 characters), about the length of Basile's
  own addresses, while typical pages pay ~0.000001 bits for the net. One random page in about
  a million is pure noise: a glimpse of Basile's Library inside ours.
- **The escape slot.** Every step of the model also has a tiny slot that hands *one* character
  to the fallback writer, so characters the model can't spell as whole tokens cost ~50 bits
  each instead of sending the whole page to the noise writer. A normal page with 40 exotic
  characters inside went from 16,159 bits to 5,318.
- **Address length in a URL.** ~375 characters is roughly the floor for exact ASCII addresses
  (~66 URL-safe symbols). The address goes in the URL fragment so server limits don't apply.

## 3b. Randomness, information, and what an address really is

- **Both libraries put the whole page in the URL.** Nothing is stored anywhere: the address is
  the page, disguised. Basile encodes the page raw (every character costs the same); we encode
  it with a highly efficient, compressed model of Spanish.
- **So our URL is exactly as long as the news.** An address carries only what the model could
  not have predicted. Little new information means a short URL; maximal information means a
  long URL.
- **Information is surprise, and maximal information is randomness.** In Shannon's terms, the
  cost of a text is how unpredictable it is. In Kolmogorov's terms, a random string is one with
  no description shorter than itself: it can't be compressed. Gibberish has the most
  information of all, and the longest addresses, while meaning almost nothing.
- **Information is not meaning.** Meaning lives in between: a cliché carries little information
  (the model saw it coming), noise carries the most (nothing could see it coming), and a
  meaningful sentence is surprising enough to say something but structured enough to be read.
  The Library's geography draws exactly this: the center is predictability, the outskirts are
  randomness, and meaningful prose lives in the middle rings.
- **Basile's Library knows nothing.** Its implicit model is uniform: every character equally
  likely. To a reader who expects nothing, every page is maximally surprising, so every address
  has the same, maximal length, and the vows and the noise cost the same.
- **Ours knows Spanish.** The language model is everything a reader of Spanish novels expects.
  An address is what's left after subtracting that knowledge: the part of the page that is
  genuinely new to someone who already knows the language. That's why natural pages get short
  addresses (~375 characters vs ~3,000) and random pages get longer ones than Basile's.
- **A complete library, as a whole, contains no information.** It holds everything, so it
  selects nothing; all the information is in the choice of where to look. Borges hinted at this
  in "La biblioteca total". The address is that choice, and its length is how much choosing it
  took.
- **Is the model just nicer padding? No: it has two roles.** (1) As a *padding writer* in search,
  it replaces Basile's random characters with prose; on its own that is cosmetic (under Basile's
  uniform code, prose padding would cost exactly as much as noise). (2) As the *code*, it defines
  the probability of every page, and the address is the page compressed under it: Shannon's
  source-coding theorem, optimal length = −log₂ P. Language modeling is compression (Delétang et
  al., "Language Modeling Is Compression", 2023). Short URLs need both at once: padding the model
  expects *and* a code built from the model's expectations. Random padding under our code costs
  ~19,000 bits; prose padding under Basile's code ~15,500; prose under our code ~2,400.
- **A two-part code.** Every library of everything splits information into what sender and
  receiver share in advance (the model, downloaded once) and what each URL carries. Basile shares
  nothing, so each URL carries a whole page. We share the Spanish language, so each URL carries
  only the news: the page's complexity *given* the model (conditional Kolmogorov complexity).
  Distance, geography and natural browsing all fall out of this measure, not of the padding.
- **Most of a search URL is not your sentence.** Your words cost ~100–300 bits; the remaining
  ~2,000 are the dice rolls that wrote the padding. That's the price of being a real page among
  many instead of a recipe (which would be shorter but is the "special room" we rejected). Make
  the padding perfectly predictable and URLs shrink, but every page collapses toward the
  repetitive center: the padding's randomness is what makes the Library varied.
- **Searching measures your own words.** The address of a search result grows with how
  surprising your text is to the Library. "Te quiero" is cheap (the Library expected it);
  your full name is expensive; a string of random keystrokes is the most expensive of all.

## 3c. The alphabet: everything written in the Latin alphabet

- Basile's Library is everything written in 29 symbols (no capitals, accents, digits or
  quotes), so most real texts aren't in it verbatim. Ours is everything written in 167
  characters: a–z, A–Z, every accented letter in Latin-1 (Spanish, Portuguese, Catalan, French,
  German, Nordic) plus Œ œ, digits, and the punctuation of ordinary books (¿ ¡ « » — … and so
  on). Emoji and other scripts are out.
- **Rule: search and the Library share one alphabet.** Otherwise there would be pages you could
  wander into but never search for. Search maps typographic variants onto the alphabet and drops
  the rest, telling you what it dropped.
- Banning characters the model *wants* is costly (capitals, early on, pushed it into URLs).
  Banning characters it almost never wants (emoji, other scripts) costs typical pages nothing.
- **Completeness:** every 3,200-character page in this alphabet has an address, guaranteed by
  three floors: every token keeps a minimum probability, the escape slot can write any single
  character, and the fallback writer can write any page. Filters make content remote, never
  absent.

## 4. Determinism and versioning: the model *is* the universe

- Search and browse must compute **bit-identical** probabilities on every device, or an address
  opens different pages in different places. Float math differs across GPUs and drivers; the
  shipping engine must be **integer-only** (int8/int4 weights, int32 accumulators, lookup-table
  nonlinearities, cf. I-BERT). Integer sums are exact in any order, so even GPUs and threads
  are deterministic.
- Every setting is part of the universe: weights, tokenizer, sampling settings, penalties,
  steering vectors, codec, page geometry. Change any of them and pages move.
- **Universes are frozen and versioned.** A manifest pins every file by SHA-256 plus golden
  fixtures (known address → page). A universe that doesn't reproduce its fixtures refuses to
  serve. Every address names its universe (`babel-1:…`). New models become new universes; old
  links keep working forever.
- Small changes only move the pages they affect: raising the profanity penalty left a fixture
  page's address unchanged, because swear words were already at the probability floor there.

## 5. Copies, uniqueness and fairness

- Decoding is a bijection between **(page, leftover)** and addresses. So each page appears at
  `encode(page, 0)` (its canonical location), and also at `encode(page, 1)`, `encode(page, 2)`…
  infinitely many times, **with frequency proportional to its probability.**
- **Measured:** random addresses of typical length are essentially never canonical (0 of 25),
  with ~22 bits of leftover, so a typical page appears ~4 million (2²²) times among addresses of
  that length, scattered so far apart nobody would meet the same page twice.
- **Why it's inevitable:** a library that is weighted by probability *and* has a page at every
  numbered location must contain copies. Basile avoids it because his Library is uniform: equal
  probabilities mean equal slots, exactly one each. Borges's narrator ("no two books are
  identical") is on Basile's side.
- The only visible symptom: pasting an entire page you're reading into search returns a
  different location.
- **"Isn't encoding the searched text in the address cheating?"** No: in a library of
  everything, *where* a text is and *what* it says are the same information, disguised. Basile's
  location for "test" is that page enciphered; you could compute the page from it with no
  library at all.
- **What would be cheating:** giving search results a special kind of address (short, growing
  with the query, in a separate part of the Library). That's a room built for you. We rejected
  it ("the City of Babel" idea, where search results got street addresses carrying the query).
- **The fair rule:** one space, one kind of address. Search builds the page around your text,
  computes its canonical address, and sends you there: an ordinary location among all the
  others. The only difference from Basile is what fills in around your text (prose instead of
  noise), which is the point of the project.
- **Human-looking addresses.** A real postal address carries ~60–80 bits; a page needs ~2,400.
  So a street name can only be a *nickname* derived from part of the address (like "Calle Mayor
  1", shared by many towns), with the exact code underneath. A street form that is itself exact
  would take 30–40 address lines.

## 6. Reachability: could you wander into your marriage vows?

Requirement: any page found by searching must also be reachable by wandering (walking hexagon to
hexagon, or random jumps), as in Basile, where it is possible if nearly impossible.

- In the one-space design, yes: hexagons are numbered and walkable, and a random jump lands on
  any address with nonzero probability.
- **The odds are absurdly better than Basile's** (estimates):

| | Basile | This Library |
|---|---|---|
| A random page is exactly your vows page | ~1 in 10⁴⁶⁸⁰ | ~1 in 10⁷²⁰ |
| A random page contains your vows somewhere (~200 chars) | ~1 in 10²⁹⁰ | ~1 in 10⁸⁵ |

- Still impossible in the lifetime of the universe, but the Library is weighted toward natural
  Spanish, so a page with real vows in it is a typical page rather than a needle in noise.
- 10⁷²⁰ places need names ~720 digits long. That's the same pigeonhole, and why exact names
  can't be short.

## 7. Geography: distance from the center

- **The center has an address (in `babel-exp-1`): `babel-exp-1:0:1:1:1:1`**, hexagon 0, zero bits away. Each step's
  slices are laid out most-likely-first, so small numbers pick the most likely words and number
  0 is the model's single most expected page. In `babel-exp-1` it is a dialogue of refusal and
  ignorance: *"—No, no, no, no, no. —Pero, ¿qué? —No lo sé. —Pues, entonces, ¿qué? —Nada. —No,
  no lo sé…"* The center of a library of everything says "I don't know".
- **Scrambling preserves distance.** Visible addresses are shuffled by a keyed permutation
  within each bit length (a Feistel network), so neighbouring locations open unrelated pages,
  as in Basile's Library, while every location keeps exactly the length of its page's
  address. Distance is untouched by scrambling.

- **A page's distance from the center = its address length = its surprisal.** It belongs to the
  text, not to where you found it, so every copy and every kind of name agrees.
- Proposed rings: *el centro* (very predictable prose, repetition) · *los barrios* (typical novel
  pages, where browsing lands) · *las afueras* (names, odd phrasing, mixed languages) · *los
  confines* (fragments, noise mixed with words) · *el vacío* (pure noise: Basile's Library).
  Boundaries to be calibrated per universe from measured pages.
- Searching your own sentence tells you how unusual it is *as the Library sees it*: "Tus votos
  están a 2.412 pasos del centro."
- **The inversion of Borges.** His librarians despair because meaning is rare. Here meaning is
  the common case, near the center, and noise lives on the outskirts.
- **A moral geography.** The content filters push erotica and gore outward, so they literally
  live in remote galleries. Completeness survives; equality doesn't. The map shows the Library's
  preferences instead of hiding them.

## 7b. The geography, measured in babel-1 (2026-10-18)

- **The centre of babel-1** (`babel-1:0:1:1:1:1`, 0 bits) is a dialogue that refuses itself:
  *"—No, no, no —dijo el señor Bergeret—. Es una historia muy larga, y no me gusta."* and then, for the
  whole page, *"—No, no es una historia muy larga."* (now and then *"muy corta"*). Bergeret and Terremondre
  are Anatole France's characters, borrowed from the training books. The centre of a library of everything
  is, again, a man saying no.
- **A page's distance belongs to the page.** Opening an arbitrary location (a book picked on a shelf of a
  random room) decodes the page from the location's number and leaves the rest of the number unused. The
  page's distance is the bits its writing used (number length minus leftover), which is its canonical
  address length: a page picked by hand in a random room measured 2,322 pasos, *los barrios*.
- **Random rooms.** A room is a hexagon name, the high part of a location's number. Drawn from a full random
  location it is ~8,600 characters long (most of the number is leftover); drawn from a 4,096-bit number it
  is ~685 characters, and every page in it still has bits to spare (a page uses ~2,400).
- **Search, measured in the browser:** «te quiero» found in ~8 s on a laptop, on a page 2,126 pasos from
  the centre, mid-scene: *"—Háblame, yo te quiero; te amo, te he amado mucho."*

## 8. Shaping the Library: what the experiments taught us

**Model choice.** Bake-off on this laptop (M4 Pro): character n-gram (delirious, locally
grammatical), Goldfish 39M (web word-salad, collapses into "¡!!!!" when sharpened), Gemma 3 270M
(web voice, drifts into English and code), Spanish GPT-2 124M by DeepESP (literary, coherent
paragraphs: the winner), its 355M sibling (clean but not clearly better per megabyte), our own
27M trained overnight (ties the 124M on a score, reads like a 19th-century manual). Smallest
model that writes coherent Spanish paragraphs: ~124M parameters.

**Constraints hurt more than they help.** Banning capitals pushed the model into URLs, because
after a preamble it wants "El" or "La" and those were forbidden. In Basile's uniform library
more symbols cost every page more bits; in a weighted library, symbols the model rarely uses
cost almost nothing, and banning the ones it wants is what costs. Final rule: any printable
text, forbidding only invisible and control characters.

**Anything in the context leaks.** Every preamble (a hidden text the model reads before each
page) imposed its content: a Borges pastiche produced libraries and bibliophiles; a neutral
everyday scene produced a Library where every page was a sequel about "Marta" and "Javier";
fragments without names still leaked the nurse and the train. Ending the preamble with an
end-of-document token stopped the leak and also the formatting. The more a preamble shapes the
page, the more of itself it leaves behind.

**Sampling settings funnel into genres.** Lowering the temperature removed broken words but
squeezed out narration (dialogue is the most predictable thing in a novel). Min-p (trim the
improbable tail) was cleaner, but narrowing to the most likely continuations funneled
two-person scenes into romance, the dominant genre of the e-books the model was trained on.
About 1 page in 10 turned erotic. Small deterministic "nudges" (open dialogue a bit less often
at a new paragraph; break short narrative paragraphs a bit less often) fixed the page shape.

**Subtract, don't prescribe.** Proposals to steer the tone (dreamlike, philosophical) were
rejected as directing the Library too much. The principle: keep the model's own mix and only
remove what's unwanted. All filtering lives inside the probability distribution (no page is
skipped, hidden or gated), so every address still opens its page and search still finds
anything.

**Activation steering, and the importance of matched contrasts.** We computed a "sexual content"
direction in the model's hidden states (mean activation on erotic passages minus mean on neutral
ones) and removed the excess along it at every step. First attempt: contrast against *all*
neutral pages, essays included. The direction learned "two people talking in a novel" as much as
"sex", and removing it turned novels into essays (pages with dialogue fell from 39/60 to 18/60).
Fix: contrast against **non-erotic dialogue scenes from novels**, holding style fixed so only
the content differs. Result: 0 erotic pages in 300, 0 graphic violence, novel-like pages *up*
(248/300), invented words down. Plus soft word penalties (sexual, graphic violence, mild
profanity: ~1 page in 100).

**Fine-tuning disappointed.** Fine-tuning on public-domain literature pulled the voice into the
19th century, taught OCR noise (library stamps, glued words), and lost the e-book layout because
the cleaning step joined paragraphs with single line breaks. Context distillation (bake a
preamble's effect into weights) achieved the page shape without leaks, but not the cleanliness.
Generation-time levers (min-p, nudges, steering) were consistently more effective than training.

**Loops are the attractor of the most likely path.** Short tokens escaped the repetition
penalty, so some pages fell into stammers (*"—He… he… he…"* for a whole page, 314 bits from the
center). A loop breaker (a stuck pattern of 1–8 tokens makes its continuation less likely)
turned that page into *"—He… he… he… he… he perdido."* and the story went on. Loops are where
probability mass pools when nothing pushes back: the center itself is one.

**Scores lie; reading doesn't.** Bits-per-character on held-out text ranked the models almost
backwards from how they read, because the held-out text came from the same distribution as the
fine-tuning data. From then on: judge by reading, with numbers as sanity checks.

## 8b. Training our own cartographer (2026-10-16)

**The corpus is the book collection, cleaned.** 83,177 pages (~65M tokens) of Spanish prose from
Gutenberg, Wikisource and Elejandría EPUBs. A word filter ("pecho", "beso", "cadáver") had thrown away
27k innocent pages; a judge model reading each flagged page in context dropped only 1.4% (explicit
erotica or explicit gore). "Pecho" is mostly courage; "me desnudé" is a sailor drying his clothes. The
same judge separated Golden-Age Spanish (Quijote, Conde Lucanor) from 19th-century prose that only
looks old ("sentóse", "díjole"), and whole books, not pages, were dropped when they were archaic.

**Little data, many passes.** A 66M-parameter model read the same books 16 times, held back from
memorising by a strong weight decay (8× the usual, following Kim et al. 2025). Result: 1.138 bits per
character on unseen pages, slightly better than the 2-billion-parameter Spanish model Salamandra on a
similar slice (1.156). A tiny specialist beats a big generalist on its own ground. Averaging the
last three weight snapshots gives a free gain (1.129).

**It generalizes to books it never saw.** Sixteen whole books were kept out of training. On them the
model scores 1.15 against 1.13 on unseen pages of familiar books: only ~1–2% worse. It learned
Spanish prose, not just these novels, although it does borrow their characters (Villefort, Bergeret,
Nela): never their sentences (0 of 43 million 13-word sequences copied in any page we checked).

**The teacher who knew less.** Distilling from Salamandra made the student worse (1.183), and its
pages started in English: before reading a word, the multilingual teacher expects a web document, and
the student learned to open with "The". A teacher only helps if it knows the territory better than
the student would alone.

**The alphabet already knows Spanish.** An untrained model with random weights writes "esperanza
tejados envueltos ¿…": no grammar, but its letters are word-pieces cut from the books, so even noise
comes out Spanish-flavoured.

**The Library's rules matter more than the last decimal.** Raw samples loop ("¡Morir yo! ¡Morir yo!"),
drift and invent words. Read through the Library (address decoding plus loop breaker, repetition
penalty, min-p and nudges), the same model's pages lose all repetition and score clearly higher with a
blind judge. The cartographer and the Library's grammar of reading are two halves of one design.

**Writing backwards, for search.** Search must place your sentence on a page that leads naturally
into it: the ideal result is drawn from *all* pages containing your sentence, in proportion to how
likely each is. Writing the text before the sentence blindly, then forcing the sentence in, produced
seams ("¡SUP te quiero"). So the same model was also trained to write right to left (a quarter of the
pages reversed, with a direction mark). Writing forwards did not suffer at all (1.1285 vs 1.1288 for a
forward-only twin; slightly better on unseen books), and the model can now write the text that
precedes a sentence: "—Mira, hija mía —añadió—; yo **te quiero** a ti"; "—Jusepa —dijo— que pasado
**mañana es tu cumpleaños**; no lo dudes, que hoy es sábado." The address is still computed from the
finished page, forwards, so this changes how search finds a page, never which pages exist.
In the working search the backward writer drafts whole paragraphs that lead into the sentence, the
forward model weighs 16 drafts and one is drawn by weight: "Y, sin embargo, **tenía miedo de la
oscuridad**, de la soledad…"; "—No —dijo el mayor—, **no lo sé**, aunque me parece que has perdido el
juicio." The pages it finds sit 2,191 and 2,333 bits from the center: as close as a page you'd
stumble on by wandering (typical: ~2,340). Your sentence is placed where the Library would have put
it anyway.

**What it writes.** Grammatical, novel-paced 19th-century prose with dialogue, consistent names within
a page, and drift over a page ("la más llamativa república del tamaño de una iglesia").

**Every device must compute the same numbers.** An address is the exact encoding of a page, so a
phone and a laptop must agree on every probability to the last digit, and floating point doesn't
(a 2026 study encoded text with Llama on one Mac and decoded it on another: 0 files came back intact).
So the model runs in integer arithmetic only: 8-bit weights, fixed-point everything, shipped tables
for exp, sigmoid and RoPE, and one rounding rule. It costs almost nothing (1.1285 → 1.1294 bits per
character), and the browser engine reproduces the reference's 16,384 logits bit for bit at every one
of 400 positions. In a browser it writes a page in about 2 seconds on a laptop; the page's address
(about 2,400–2,800 bits) is computed back from its text and reopens it exactly. The universe is no
longer a model plus hardware: it is a list of integers.

**Cost.** Rented GPUs for a day of experiments: about $15. Three models trained from scratch, a
teacher pass, and the forward/backward comparison.

## 9. What's gained and lost compared with Basile

Lost:
- **Vertigo.** In Basile's Library meaning is a miracle; your sentence is marooned in noise.
  Here meaning is everywhere, and the uncanny feeling is that *someone wrote this*.
- **Neutrality.** "Your text was always there" stays true (completeness), but the Library has
  preferences: the model's taste and ours.
- **Purity.** One formula with no author versus a trained model with a house style: an endless,
  mid-quality contemporary novelist.
- **The AI connotation.** Basile's gibberish can't be mistaken for AI writing; semi-coherent
  prose can. Paradox: making pages too clean makes it worse. Some strangeness is the magic.
- **Uniqueness** (see §5).

Gained:
- **Wandering pays off:** a random page can move you.
- **Search is uncanny:** your sentence inside someone else's story, mid-scene, with a character
  answering it.
- **Shorter, more human addresses** (~8× shorter; street-style nicknames).
- **Spanish,** Borges's language, and any printable text instead of 29 symbols.

Proposal: offer both rooms in the same building. *La Biblioteca total* (uniform, Basile's rules,
in Spanish: pure arithmetic, every page once, mostly noise) and *La Biblioteca de Babel* (the
Library read through a model's eyes). The contrast makes each one's magic visible. A note in the
Library itself, *el bibliotecario es un modelo de lenguaje que leyó miles de novelas*, turns the
model's taste into part of the story.

## 10. Open questions

- The safety-net weight is 1 in 2²⁰ (about a million). Should the void be more visible (1 in a
  thousand) or legendary (1 in a billion)?
- Calibrating the distance rings; naming the unit (*pasos*?).
- Search as posterior sampling: the backward writer drafts ~48 tokens leading into the sentence, the
  forward model weighs several drafts, and one is drawn in proportion to its probability. Open: how
  many drafts a phone can afford, and the seam where forward text meets the backward bridge (a
  fill-in-the-middle model would see both sides).
- Titles for books, and title search (a model-written title from part of the book's number).
- The integer engine and the first truly public, bit-exact universe.
- Copyright: the stock model was trained partly on contemporary e-books (a page reproduced an
  "ePub r1.5 Titivillus" credit). Check pages don't contain recognizable passages from real
  books. Borges's own text is under copyright until 2056; the estate made Basile remove a quote.

## 11. References

- Borges, J. L. "La biblioteca de Babel" (1941); "La biblioteca total" (1939).
- Basile, J. libraryofbabel.info (2015); *Tar for Mortar: "The Library of Babel" and the Dream
  of Totality* (2018).
- Duda, J. Asymmetric numeral systems (rANS), 2009–2014.
- Kim, S. et al. I-BERT: Integer-only BERT quantization (2021).
- Eldan, R. & Li, Y. TinyStories (2023), arXiv:2305.07759.
- Chang, T. et al. Goldfish: Monolingual language models for 350 languages (2024), arXiv:2408.10441.
- Hoffmann, J. et al. Chinchilla scaling laws (2022), arXiv:2203.15556.
- Muennighoff, N. et al. Scaling data-constrained language models (2023), arXiv:2305.16264.
- Wortsman, M. et al. WiSE-FT: Robust fine-tuning of zero-shot models (2022), arXiv:2109.01903.
- Biderman, D. et al. LoRA learns less and forgets less (2024), arXiv:2405.09673.
- Liu, A. et al. DExperts (2021), arXiv:2105.03023; Tuning language models by proxy (2024), arXiv:2401.08565.
- Turner, A. et al. Activation addition (2023); Zou, A. et al. Representation engineering (2023);
  Arditi, A. et al. Refusal is mediated by a single direction (2024).
- Bavarian, M. et al. Efficient training of language models to fill in the middle (2022).
- Askell, A. et al. (2021) and Snell, C. et al. (2022): context distillation.
- Kim, K., Kotha, S., Liang, P., Hashimoto, T. Pre-training under infinite compute (2025), arXiv:2509.14786.
- Chai, Y. & Xiong, H. What is a repeated token worth? (2026), arXiv:2610.05591.
- Chen, M. K. et al. Demystifying training-time augmentation for data-constrained LM pretraining (2026), arXiv:2606.16246.
- Papadopoulos, V. et al. Arrows of time for large language models (2024), arXiv:2401.17505.
- Golovneva, O. et al. Reverse training to nurse the reversal curse (2024), arXiv:2403.13799.
- Busbridge, D. et al. Distillation scaling laws (2025), arXiv:2502.08606.
- Anshumann et al. Sparse logit sampling (2025), arXiv:2503.16870.
- Lew, A. et al. Sequential Monte Carlo steering of LLMs using probabilistic programs (2023), arXiv:2306.03081.
- Q Labs. NanoGPT Slowrun: fixed-data, many-epoch training records (2026), github.com/qlabs-eng/slowrun.
