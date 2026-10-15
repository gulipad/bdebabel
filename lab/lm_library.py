# /// script
# requires-python = ">=3.12"
# dependencies = ["mlx-lm>=0.28", "transformers<5", "numpy", "sentencepiece", "protobuf"]
# ///
"""
Bake-off harness: the Library of Babel with a pretrained neural LM as its cartographer.

Same design as the TypeScript n-gram prototype (src/codec.ts): the model gives a
probability for every next token, the probabilities are quantized to integers, and
exact rANS on Python ints maps address <-> page in both directions.

    uv run lab/lm_library.py --model google/gemma-3-270m

Float caveat: this runs MLX in float, so addresses are only reproducible on this
machine with this software. That is fine for judging text quality; the shipping
engine must be integer-only.
"""
import argparse, math, random, re, time, unicodedata
from pathlib import Path

import json

import mlx.core as mx
import numpy as np
from huggingface_hub import snapshot_download
from mlx_lm import load
from mlx_lm.models.cache import make_prompt_cache

# --- what may appear on a page (v3: anything printable) ---
# Every printable Unicode character plus newline. Forbidden only: control characters,
# invisible formatting (zero-width, bidi overrides), private-use, unassigned, surrogates.
# Those would let two pages look identical while being different pages.
PAGE_CHARS = 3200
FORBIDDEN = {"Cc", "Cf", "Co", "Cn", "Cs"}

def allowed_char(c: str) -> bool:
    return c == "\n" or unicodedata.category(c) not in FORBIDDEN

def normalize(text: str) -> str:
    """Queries: NFC, CRLF to LF, tabs to spaces, weird characters dropped."""
    text = unicodedata.normalize("NFC", text).replace("\r\n", "\n").replace("\t", " ")
    return "".join(c for c in text if allowed_char(c))

SCALE = 1 << 32  # per-step frequency resolution; +1 floor keeps every string possible


class LMLibrary:
    def __init__(self, repo: str, temperature=1.0, top_p=1.0, repetition_penalty=1.0, window=128, preamble="", preamble_eos=False,
                 min_p=0.0, dialogue_bias=0.0, paragraph_bias=0.0, paragraph_min=200, avoid_bias=0.0,
                 violence_bias=0.0, profanity_bias=0.0, steer=None, steer_layers=(3, 11), steer_dir=None):
        path = Path(repo) if Path(repo).is_dir() else Path(snapshot_download(repo))
        self.model, wrapper = load(str(path))
        self.tok = wrapper._tokenizer
        cfg = json.loads((path / "config.json").read_text())
        cfg = cfg.get("text_config", cfg)
        # Models with short context (GPT-2: 512–1024 positions) need a sliding window.
        self.max_ctx = min(cfg.get("n_positions") or cfg.get("max_position_embeddings") or 1 << 20, 4096)
        self.temperature, self.top_p = temperature, top_p
        self.penalty, self.window = repetition_penalty, window
        self.min_p, self.dialogue_bias = min_p, dialogue_bias
        self.paragraph_bias, self.paragraph_min = paragraph_bias, paragraph_min
        self.avoid_bias, self.violence_bias, self.profanity_bias = avoid_bias, violence_bias, profanity_bias
        self.steer_dir = Path(steer_dir) if steer_dir else Path(__file__).resolve().parent / "steer"
        if steer: self._install_steering(steer, tuple(steer_layers))
        self.bos = [self.tok.bos_token_id] if self.tok.bos_token_id is not None else []
        # A hidden, fixed preamble the model reads before every page (not part of the page).
        # It steers the voice; being constant, it is simply part of the frozen universe.
        if preamble:
            self.bos += self.tok.encode(preamble, add_special_tokens=False)
            # End-of-document after the preamble: the page reads as a new, unrelated document,
            # so the preamble can shape the format without lending its characters.
            if preamble_eos: self.bos.append(self.tok.eos_token_id)

        # Vocabulary trimming: keep only tokens spelled entirely in the alphabet.
        pieces = self.tok.convert_ids_to_tokens(list(range(len(self.tok))))
        # GPT-2-style byte-level BPE spells " a" as "Ġa"; SentencePiece spells it "▁a".
        byte_level = self.tok.convert_ids_to_tokens(self.tok.encode(" a", add_special_tokens=False))[0].startswith("Ġ")
        if byte_level:
            from transformers.models.gpt2.tokenization_gpt2 import bytes_to_unicode
            unbyte = {v: k for k, v in bytes_to_unicode().items()}
        ids, texts, natural = [], [], []
        special = set(self.tok.all_special_ids)  # a computed property: never call it in the loop
        for i, p in enumerate(pieces):
            if p is None or re.fullmatch(r"<0x[0-9A-Fa-f]{2}>", p): continue
            if byte_level:
                try: t = bytes(unbyte[c] for c in p).decode("utf-8")
                except (KeyError, UnicodeDecodeError): continue
            else:
                t = p.replace("▁", " ")
            if t and all(allowed_char(c) for c in t) and i not in special:
                ids.append(i); texts.append(t); natural.append(t == p.replace("▁", " ") or byte_level)
        self.ids = np.array(ids)
        self.texts = texts
        self.lens = np.array([len(t) for t in texts])
        self.index = {tid: k for k, tid in enumerate(ids)}
        # Greedy fallback prefers the token whose original spelling is the text itself.
        self.by_text = {}
        for t, tid, nat in zip(texts, ids, natural):
            if nat or t not in self.by_text: self.by_text[t] = tid
        self.longest = int(self.lens.max())
        # Function words and punctuation repeat naturally; only penalize longer tokens.
        self.penalizable = np.array([len(t.strip()) > 3 for t in texts])
        # Tokens that open a line of dialogue, and tokens that end a line (for the dialogue nudge).
        self.opens_dialogue = np.array([t.lstrip(" ").startswith(("—", "-", "–")) for t in texts])
        self.ends_line = np.array([t.endswith("\n") for t in texts])
        self.breaks_line = np.array(["\n" in t for t in texts])
        # Subtractive filter: romance and explicit vocabulary is made less likely (never impossible).
        # The model isn't told what to write, only what to avoid. "cama" is deliberately absent.
        AVOID_WORDS = set("""beso besos besó besar besarla besarlo besarle besaba besaban besaron besándola besándolo
            labios caricia caricias amante amantes sensual sensuales erótico erótica eróticos
            pechos pecho pezón pezones muslo muslos nalgas trasero bragas sujetador lencería
            sexo sexual sexuales pene polla vagina coño clítoris orgasmo erección gemido gemidos gimió gemía
            desnudo desnuda desnudos desnudas desnudó desnudarse lamió lamer chupar chupó horcajadas""".split())
        AVOID_PREFIXES = ("acarici", "desnud", "excitad", "excitaci", "sexual", "erótic", "orgasm", "seduc", "lujuri", "masturb", "eyacul",
                          "penetr", "jade", "gemir", "lascivi", "voluptu")
        def avoided(t):
            w = t.strip().lower()
            return len(w) >= 4 and (w in AVOID_WORDS or w.startswith(AVOID_PREFIXES))
        self.avoid = np.array([avoided(t) for t in texts])
        VIOLENCE = ("degoll", "destrip", "descuartiz", "mutil", "vísceras", "tortur", "apuñal", "ensangrent", "sesos", "despedaz", "decapit")
        PROFANITY = set("mierda joder jodido jodida puta puto putas putos coño cabrón cabrones hostia hostias gilipollas cojones carajo".split())
        self.violent = np.array([t.strip().lower().startswith(VIOLENCE) and len(t.strip()) >= 4 for t in texts])
        self.profane = np.array([t.strip().lower() in PROFANITY for t in texts])
        # For case-insensitive search: tokens grouped by their lowercased first character.
        self.lower = [t.lower() for t in texts]
        self.by_first: dict[str, list[int]] = {}
        for k, t in enumerate(self.lower): self.by_first.setdefault(t[0], []).append(k)
        # Characters the vocabulary can't spell as whole tokens are unreachable here; the real
        # engine handles partial-UTF-8 byte tokens with a small validity state machine.
        print(f"vocab {len(self.tok):,} → {len(ids):,} printable tokens ({100 * len(ids) / len(self.tok):.0f}%)")

    # --- the model as an integer distribution over the trimmed vocabulary ---

    def _install_steering(self, steer: dict, layers: tuple):
        """
        Activation steering (see lab/steer.py): in blocks [a, b), remove the part of each hidden
        state that exceeds neutral text along the "sexual" / "violence" directions, scaled by
        strength. Deterministic, inside the distribution: no page is skipped or hidden.
        """
        blocks = self.model.model.h
        cls = type(blocks[0])
        if not getattr(cls, "_steerable", False):
            orig = cls.__call__
            def steered(block, x, mask=None, cache=None):
                out = orig(block, x, mask, cache)
                for v, base, strength in getattr(block, "_steer", ()):
                    excess = mx.maximum((out * v).sum(-1, keepdims=True) - base, 0)
                    out = out - strength * excess * v
                return out
            cls.__call__ = steered; cls._steerable = True
        root = self.steer_dir
        for i in range(*layers):
            blocks[i]._steer = []
            for name, strength in steer.items():
                d = np.load(root / f"{name}.npz")
                blocks[i]._steer.append((mx.array(d["unit"][i]), float(d["neutral"][i]), float(strength)))

    def _dist(self, logits: mx.array, remaining: int, history: list[int] = ()):
        z = np.array(logits.astype(mx.float32))[self.ids].astype(np.float64)
        if self.penalty != 1.0 and history:
            # CTRL-style repetition penalty over the recent window: a deterministic function
            # of the text so far, so search and browse still agree.
            recent = np.array(sorted({self.index[t] for t in history[-self.window:] if t in self.index}), dtype=np.int64)
            recent = recent[self.penalizable[recent]] if len(recent) else recent
            z[recent] = np.where(z[recent] > 0, z[recent] / self.penalty, z[recent] * self.penalty)
        z = z / self.temperature
        if self.dialogue_bias and history and self.ends_line[self.index.get(history[-1], 0)]:
            z[self.opens_dialogue] -= self.dialogue_bias  # at a new paragraph, open dialogue a bit less often
        if self.avoid_bias:
            z[self.avoid] -= self.avoid_bias
        if self.violence_bias:
            z[self.violent] -= self.violence_bias
        if self.profanity_bias:
            z[self.profane] -= self.profanity_bias
        if self.paragraph_bias and history:
            # While a narrative paragraph is still short, break it a bit less often.
            para, i = "", len(history) - 1
            while i >= 0 and len(para) < self.paragraph_min:
                t = self.texts[self.index[history[i]]] if history[i] in self.index else ""
                if "\n" in t: para = t.rsplit("\n", 1)[1] + para; break
                para = t + para; i -= 1
            if 0 < len(para.strip()) < self.paragraph_min and not para.lstrip().startswith(("—", "-", "–", "«", '"')):
                z[self.breaks_line] -= self.paragraph_bias
        fits = self.lens <= remaining
        z[~fits] = -np.inf
        p = np.exp(z - z.max()); p /= p.sum()
        if self.top_p < 1.0:  # soft truncation: tail tokens fall to the +1 floor below
            order = np.argsort(-p)
            keep = order[: np.searchsorted(np.cumsum(p[order]), self.top_p) + 1]
            q = np.zeros_like(p); q[keep] = p[keep]; p = q / q.sum()
        if self.min_p > 0:  # trim the junk tail without reshaping the plausible tokens
            p = np.where(p >= self.min_p * p.max(), p, 0.0); p /= p.sum()
        freq = np.floor(p * SCALE).astype(np.int64) + 1
        freq[~fits] = 0
        return freq, np.cumsum(freq)

    def _steps(self, context: list[int]):
        """
        Feeds tokens one at a time (same path for encode and decode → identical floats).
        When the context window fills, it restarts from the last half: a deterministic rule.
        """
        seen = list(context)
        def restart():
            cache = make_prompt_cache(self.model)
            window = seen[-(self.max_ctx // 2):] if len(seen) + len(self.bos) >= self.max_ctx else seen
            return cache, len(self.bos) + len(window), self.model(mx.array([self.bos + window]), cache=cache)[0, -1]
        cache, used, logits = restart()
        while True:
            tok = yield logits
            seen.append(tok)
            if used + 1 >= self.max_ctx:
                cache, used, logits = restart()
            else:
                logits = self.model(mx.array([[tok]]), cache=cache)[0, -1]; used += 1

    def decode(self, x: int, chars: int, context: list[int] = ()) -> tuple[list[int], int]:
        """Reads `chars` characters of text out of the integer x. Returns (token ids, leftover)."""
        steps = self._steps(list(context)); logits = next(steps)
        out, remaining = [], chars
        while remaining > 0:
            freq, cum = self._dist(logits, remaining, list(context) + out)
            T = int(cum[-1]); r = x % T
            k = int(np.searchsorted(cum, r, side="right"))
            f = int(freq[k]); x = f * (x // T) + r - (int(cum[k]) - f)
            out.append(int(self.ids[k])); remaining -= int(self.lens[k])
            if remaining > 0: logits = steps.send(out[-1])
        return out, x

    def canonical(self, text: str) -> list[int]:
        """
        A deterministic tokenization of any alphabet string. Uses the model's own tokenizer
        when it reproduces the text exactly; otherwise (e.g. tokenizers that strip spaces)
        falls back to greedy longest match over the trimmed vocabulary.
        """
        toks = self.tok.encode(text, add_special_tokens=False)
        if all(t in self.index for t in toks) and "".join(self.texts[self.index[t]] for t in toks) == text:
            return toks
        out, i = [], 0
        while i < len(text):
            for n in range(min(self.longest, len(text) - i), 0, -1):
                if (t := self.by_text.get(text[i:i + n])) is not None:
                    out.append(t); i += n; break
        return out

    def encode(self, text: str) -> int:
        """The canonical address of a page: rANS-encode its canonical tokens, last first."""
        toks = self.canonical(text)
        steps = self._steps([]); logits = next(steps)
        coded, remaining = [], len(text)
        for i, t in enumerate(toks):
            freq, cum = self._dist(logits, remaining, toks[:i])
            k = self.index[t]
            coded.append((int(freq[k]), int(cum[k]) - int(freq[k]), int(cum[-1])))
            remaining -= int(self.lens[k])
            if i + 1 < len(toks): logits = steps.send(t)
        x = 0
        for f, c, T in reversed(coded): x = (x // f) * T + c + (x % f)
        return x

    def write_query(self, q: str, context: list[int]) -> list[int]:
        """
        Writes `q` ignoring case: at each step only tokens matching the query (case-insensitively)
        are allowed, and the model's favourite wins. So "hoy me desperté" comes out as "Hoy me
        desperté" at the start of a sentence, and names get their capitals.
        """
        steps = self._steps(list(context)); logits = next(steps)
        ql, out, i = q.lower(), [], 0
        while i < len(q):
            z = np.array(logits.astype(mx.float32))[self.ids]
            cands = [k for k in self.by_first.get(ql[i], []) if ql.startswith(self.lower[k], i)]
            longest = max(self.lens[k] for k in cands)  # longest match: the model only picks the casing
            k = max((k for k in cands if self.lens[k] == longest), key=lambda k: z[k])
            out.append(int(self.ids[k])); i += int(self.lens[k])
            if i < len(q): logits = steps.send(out[-1])
        return out

    def text_of(self, toks: list[int]) -> str:
        return "".join(self.texts[self.index[t]] for t in toks)

    # --- the Library ---

    def page_at(self, address: int) -> tuple[str, bool]:
        toks, rest = self.decode(address, PAGE_CHARS)
        return self.text_of(toks), rest == 0

    def random_page(self, seed: str) -> str:
        x = random.Random(seed).getrandbits(PAGE_CHARS * 16)
        return self.text_of(self.decode(x, PAGE_CHARS)[0])

    def search(self, query: str, seed: str, exact=False) -> tuple[str, int]:
        q = normalize(query)
        rng = random.Random(f"{seed}|{q if exact else q.lower()}")
        q = f" {q.strip()} "  # keep words whole
        offset = rng.randrange(PAGE_CHARS - len(q) + 1)
        before = self.decode(rng.getrandbits(offset * 16 + 64), offset)[0] if offset else []
        q_toks = self.canonical(q) if exact else self.write_query(q, before)
        head = before + q_toks
        after = self.decode(rng.getrandbits(PAGE_CHARS * 16), PAGE_CHARS - offset - len(q), head)[0]
        return self.text_of(head) + self.text_of(after), offset + 1


# --- address formatting (mirror of src/address.ts) ---

def format_address(n: int) -> str:
    coords = []
    for k in (410, 32, 5, 4):
        coords.append(n % k + 1); n //= k
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    hexagon = ""
    while True:
        n, d = divmod(n, 36); hexagon = digits[d] + hexagon
        if n == 0: break
    page, vol, shelf, wall = coords
    short = hexagon if len(hexagon) <= 40 else f"{hexagon[:20]}…{hexagon[-8:]}"
    return f"hexágono {short} ({len(hexagon)} car.) · muro {wall} · anaquel {shelf} · volumen {vol} · página {page}"


def wrap(text: str, width=80) -> str:
    out = []
    for para in text.split("\n"):
        lines, line = [], ""
        for w in para.split(" "):
            if line and len(line) + 1 + len(w) > width: lines.append(line); line = w
            else: line = f"{line} {w}" if line else w
        out.append("\n".join(lines + [line]))
    return "\n".join(out)


def report(lib: LMLibrary, title: str, text: str, out: list[str]):
    t = time.time(); n = lib.encode(text); t_enc = time.time() - t
    t = time.time(); back, canonical = lib.page_at(n); t_dec = time.time() - t
    ok = back == text and canonical
    block = (f"\n=== {title} ===\n{wrap(text)}\n" + "─" * 80 + f"\n{format_address(n)}\n"
             f"{n.bit_length()} bits ({n.bit_length() / PAGE_CHARS:.2f} bits/car.) · "
             f"codificar {t_enc:.1f}s · leer {t_dec:.1f}s · ida y vuelta {'OK' if ok else 'FALLÓ'}\n")
    print(block, flush=True); out.append(block)
    if not ok: raise SystemExit("round trip failed")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="google/gemma-3-270m")
    ap.add_argument("--temperature", type=float, default=1.0)
    ap.add_argument("--top-p", type=float, default=1.0)
    ap.add_argument("--repetition-penalty", type=float, default=1.0)
    ap.add_argument("--preamble", default="")
    ap.add_argument("--preamble-file", default=None)
    ap.add_argument("--exact", action="store_true", help="case-sensitive search")
    ap.add_argument("--pages", type=int, default=2)
    ap.add_argument("--query", default="Hoy me desperté pensando en ti, y en la biblioteca infinita.")
    a = ap.parse_args()

    lib = LMLibrary(a.model, a.temperature, a.top_p, a.repetition_penalty, preamble=Path(a.preamble_file).read_text() if a.preamble_file else a.preamble.replace("\\n", "\n"))
    out: list[str] = [f"modelo {a.model} · temperatura {a.temperature} · top-p {a.top_p} · repetición {a.repetition_penalty}\n"]
    for i in range(a.pages):
        t = time.time(); text = lib.random_page(f"página-{i}")
        report(lib, f"página al azar {i} (generada en {time.time() - t:.1f}s)", text, out)
    t = time.time(); text, at = lib.search(a.query, "0", a.exact)
    report(lib, f"búsqueda: «{normalize(a.query)}» en el carácter {at} ({time.time() - t:.1f}s)", text, out)

    dest = Path(__file__).parent / "out" / f"{a.model.split('/')[-1]}-t{a.temperature}-p{a.top_p}-r{a.repetition_penalty}{'-' + Path(a.preamble_file).stem if a.preamble_file else ('-pre' if a.preamble else '')}.txt"
    dest.parent.mkdir(exist_ok=True); dest.write_text("".join(out))
    print(f"guardado en {dest}")
