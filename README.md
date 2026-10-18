<p align="center">
  <img src="docs/readme/portada.jpg" alt="La Biblioteca de Babel: the cover, a city of hexagonal rooms drawn in ink" width="100%">
</p>

# La Ciudad de Babel

**Borges's Library of Babel, in Spanish, with a language model as its cartographer.** You can walk
it at [babel.gulipad.com](https://babel.gulipad.com).

In 1941 Borges imagined a library that holds every possible book. In 2015 Jonathan Basile
[built it](https://libraryofbabel.info) without storing a single page. Every page of
3,200 characters exists, and an invertible function maps each address to its page and back. The
problem is that almost every page is noise, and the address of a page is as long as the page itself
(~3,000 characters for a page of 3,200).

So we (Claude and I) built one for Spanish. Every page still exists, but a small language model decides
how the shelves are weighted. Readable prose sits near the centre, noise gets pushed out to the edges,
and the address of a page is the page compressed. A typical address comes out 6-7x shorter than
Basile's.

## Every page is a number

Think of the model as a writer who rolls a die before every word. An address is the list of rolls,
packed into one very big number. **Browsing** unpacks the rolls and lets the model write. **Searching**
does the opposite: it asks, at each word, which roll would have produced it. Under the hood this is
arithmetic coding (rANS) over the model's probabilities, which gives an exact, invertible map between
numbers and pages.

<p align="center"><img src="docs/readme/intervalos.jpg" alt="The number line split by the probabilities of the next word" width="80%"></p>

Each word costs −log₂ p bits, so an address is exactly as long as what the model couldn't see coming.
Basile's library expects nothing, so every page costs the same ~15,500 bits, whether it's your wedding
vows or keyboard mash. Ours knows Spanish, so it spends the short addresses on the pages people
actually read (and charges more for noise, which seems fair).

<p align="center"><img src="docs/readme/longitudes.jpg" alt="Address length: 2,300 bits here, 15,500 in Basile's library, 19,500 for pure noise" width="80%"></p>

## A geography

Once address length is distance, the library gets a map. **El Centro** is the single most probable page,
at address `babel-1:0:1:1:1:1`, zero steps away. Around it lie Los Barrios, Las Afueras, Los Confines
and finally El Vacío, where the noise lives. If you search «te quiero», you land 2,126 steps from the
centre, in the middle of a scene.

<p align="center"><img src="docs/readme/anillos.jpg" alt="The rings of the Library: El Centro, Los Barrios, Las Afueras, Los Confines, El Vacío" width="60%"></p>

You can't store it, though. The whole library weighs ~10⁴⁶⁸³ bytes. Take a
universe where every atom is a 1 PB disk: it holds 10⁹⁵ bytes. Now make every atom of _that_ a universe
of disks, and repeat. You need to go 59 levels down before the library fits.

<p align="center"><img src="docs/readme/universos.jpg" alt="Universes inside universes, zooming into an atom" width="80%"></p>

## The city

There are three ways in. **Teoría** is an illustrated essay on how all of this works. **Buscar** finds
any sentence on a page. **Ir** takes you to an address, or drops you in a random room, where you pick a
wall, a shelf, a book and a page, like in Borges.

|                                                                                       |                                                                                    |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| ![A room seen from above: four walls and the ventilation shaft](docs/readme/sala.jpg) | ![A wall: five shelves of 32 books](docs/readme/muro.jpg)                          |
| ![The essay, La Biblioteca Infinita](docs/readme/teoria.jpg)                          | ![A search result, the sentence marked in red on its page](docs/readme/pagina.jpg) |

A search gives the same page for the same sentence, every time, at an ordinary address like any other.
The model writes the text around your words, and that page is somewhere you could also stumble into by
walking (very, very unlikely, but possible).

## The model is the universe

An address has to open the same page on every device, forever. Floating-point maths differs between
GPUs and browsers, so a float model would quietly move pages around. That's why the model runs on an
**integer-only engine** (int8 weights, int32 sums, lookup tables for the nonlinearities) in
WebAssembly, bit-exact everywhere. Everything that decides a page (weights, tokenizer, sampling rules,
codec) is frozen into a **universe** and pinned by SHA-256 in its
[`manifest.json`](lab/universes/babel-1/manifest.json). Every address names its universe (`babel-1:…`),
so a better model becomes a new universe and old links keep working.

The model, **librarian-1**, has 66M parameters. We trained it from scratch on 83k pages of public-domain
Spanish prose (Gutenberg, Wikisource, Elejandría), reading forwards and, a quarter of the time,
backwards. The backward reading is what lets search write the text that leads _into_ your sentence. On
pages it never saw it scores 1.138 bits per character, slightly better than Salamandra, a 2B-parameter
Spanish model (1.156). A day of training experiments on rented GPUs cost ~$15.

Everything runs in your browser. The model (77 MB) downloads once and is checked against the manifest
before it writes a single word.

## Repository

| Folder                                            | What's in it                                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [`app/`](app)                                     | The city: SvelteKit, every page computed on the reader's device                                         |
| [`lab/`](lab)                                     | Training, the integer engine, evaluations and the frozen universes                                      |
| [`lab/universes/babel-1/`](lab/universes/babel-1) | The universe the city reads (its weights are on [Hugging Face](https://huggingface.co/Gulipad/babel-1)) |
| [`docs/article-notes.md`](docs/article-notes.md)  | The maths, the measurements and every experiment, in detail                                             |
| [`deploy/`](deploy)                               | `fetch-universe.sh`, to bring a universe's weights back for local work                                  |

## Running it

```sh
deploy/fetch-universe.sh babel-1     # downloads the weights (77 MB) from Hugging Face and checks them
cd app
pnpm install
pnpm dev                             # http://localhost:5173
```

You need Node 22. Every push to `main` deploys the city to Vercel ([`vercel.json`](vercel.json)): it builds the
app, puts the universe next to it, and the browser fetches the weights from Hugging Face.

## Thanks

To Jorge Luis Borges for _La biblioteca de Babel_, and to Jonathan Basile for
[libraryofbabel.info](https://libraryofbabel.info), which made it real first.

Made with ❤️ by [Gulipad](https://gulipad.com), with Claude.
