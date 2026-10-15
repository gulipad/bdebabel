# Article notes: the math and philosophy of bdebabel

Raw material for an article about this project. Organized by theme, with the numbers we
measured and the experiments that taught us something. Kept up to date as the project moves.

Last updated: 2026-10-15 (universe `babel-1`, codec `rans-2`).

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
- **Measured (universe `babel-1`):** a typical page costs ~2,200 bits (1,900–2,400), ~375
  characters in base 62. Basile: ~15,500 bits, ~3,000 characters. **About 8× shorter.**
- Gibberish costs *more* than in Basile's Library (20,000+ bits). We spend the short addresses on
  the pages people visit.
- **What typed text costs** (bits under `babel-1`): *test* 33 · *Te quiero* 64 · *Gonzalo
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

- **The center has an address: `babel-1:0:1:1:1:1`**, hexagon 0, zero bits away. Each step's
  slices are laid out most-likely-first, so small numbers pick the most likely words and number
  0 is the model's single most expected page. In `babel-1` it is a dialogue of refusal and
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
- Search quality: start the sentence at a natural break, pick the best of several drafts by
  P(sentence | text before), calmer surroundings. Deterministic, versioned with the universe.
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
