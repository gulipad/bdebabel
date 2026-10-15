# /// script
# requires-python = ">=3.12"
# dependencies = ["mlx-lm>=0.28", "transformers<5", "numpy", "sentencepiece", "protobuf"]
# ///
"""
Universes: frozen, versioned Libraries.

A universe pins everything that decides which text lives at which address: model weights,
tokenizer, every sampling setting, the steering vectors, the codec and the page geometry.
Its directory is immutable once frozen; new models or settings become new universes, and
old links keep working because every address names its universe.

  lab/universes/<id>/
    manifest.json   settings + SHA-256 of every file + golden fixtures
    model/          weights and tokenizer (hard links to the source files: no extra disk)
    steer/          steering vectors (copied: they are the most likely thing to change)

    uv run lab/universe.py freeze babel-lab-1 --from-recommended "first filtered lab universe"
    uv run lab/universe.py verify babel-lab-1
    uv run lab/universe.py page   babel-lab-1:<hexágono>:<muro>:<anaquel>:<volumen>:<página>
    uv run lab/universe.py list
"""
import argparse, hashlib, json, os, shutil, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from lm_library import LMLibrary, PAGE_CHARS, format_address  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
UNIVERSES = ROOT / "lab" / "universes"
CODEC = "rans-bigint-1"        # src/codec.ts and lm_library.py: exact rANS, canonical = encode(page, 0)
CHARACTERS = "printable-1"     # any printable Unicode + newline; no control/format/private/unassigned
ADDRESS = "hex36-4-5-32-410-1" # hexágono base 36 · muro 1–4 · anaquel 1–5 · volumen 1–32 · página 1–410

# The current recommendation (shelf 16 on the comparison page).
RECOMMENDED = {
    "model": "lab/models/gpt2-spanish",
    "settings": {"repetition_penalty": 1.3, "min_p": 0.02, "dialogue_bias": 1.0, "paragraph_bias": 1.5,
                 "avoid_bias": 6.0, "violence_bias": 6.0, "profanity_bias": 1.5,
                 "steer": {"sexual": 1.0, "violence": 1.0}, "steer_layers": [3, 11]},
}
FIXTURE_SEEDS = ["fixture-0", "fixture-1"]
FIXTURE_QUERY = ("Hoy me desperté pensando en ti, y en la biblioteca infinita.", "0")


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""): h.update(chunk)
    return h.hexdigest()


def address_int(addr: str) -> tuple[str, int]:
    """'<universe>:<hex>:<wall>:<shelf>:<volume>:<page>' -> (universe, catalogue number)."""
    uid, hexagon, *coords = addr.strip().split(":")
    wall, shelf, volume, page = map(int, coords)
    n = int(hexagon, 36)
    for v, k in [(wall, 4), (shelf, 5), (volume, 32), (page, 410)]:
        if not 1 <= v <= k: raise ValueError(f"coordinate {v} out of range 1..{k}")
        n = n * k + (v - 1)
    return uid, n


def address_str(uid: str, n: int) -> str:
    coords = []
    for k in (410, 32, 5, 4): coords.append(n % k + 1); n //= k
    digits, h = "0123456789abcdefghijklmnopqrstuvwxyz", ""
    while True:
        n, r = divmod(n, 36); h = digits[r] + h
        if n == 0: break
    page, volume, shelf, wall = coords
    return f"{uid}:{h}:{wall}:{shelf}:{volume}:{page}"


def load(uid: str, verify_files=True) -> tuple[LMLibrary, dict]:
    d = UNIVERSES / uid
    m = json.loads((d / "manifest.json").read_text())
    if verify_files:
        for rel, digest in m["files"].items():
            if sha256(d / rel) != digest:
                raise SystemExit(f"{uid}: {rel} does not match its manifest. Refusing to serve a drifted universe.")
    s = dict(m["settings"]); s["steer_layers"] = tuple(s.get("steer_layers", (3, 11)))
    lib = LMLibrary(str(d / "model"), steer_dir=str(d / "steer"), **s)
    return lib, m


def freeze(uid: str, description: str):
    d = UNIVERSES / uid
    if d.exists(): raise SystemExit(f"{uid} already exists. Universes are immutable: pick a new id.")
    (d / "model").mkdir(parents=True); (d / "steer").mkdir()
    src = ROOT / RECOMMENDED["model"]
    for f in src.iterdir():
        if f.is_file(): os.link(f, d / "model" / f.name)  # hard link: same bytes, no extra disk
    for name in RECOMMENDED["settings"].get("steer", {}):
        shutil.copy(ROOT / "lab/steer" / f"{name}.npz", d / "steer" / f"{name}.npz")
    files = {str(p.relative_to(d)): sha256(p) for p in sorted(d.rglob("*")) if p.is_file()}
    manifest = {"id": uid, "description": description, "frozen": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                "status": "lab (float MLX: bit-exact on this machine only)",
                "codec": CODEC, "characters": CHARACTERS, "address": ADDRESS, "page_chars": PAGE_CHARS,
                "source_model": RECOMMENDED["model"], "settings": RECOMMENDED["settings"], "files": files, "fixtures": []}
    (d / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    lib, _ = load(uid)
    fixtures = []
    for seed in FIXTURE_SEEDS:
        text = lib.random_page(seed); n = lib.encode(text)
        fixtures.append({"kind": "random", "seed": seed, "address": address_str(uid, n), "sha256": hashlib.sha256(text.encode()).hexdigest()})
    text, _ = lib.search(*FIXTURE_QUERY); n = lib.encode(text)
    fixtures.append({"kind": "search", "query": FIXTURE_QUERY[0], "seed": FIXTURE_QUERY[1], "address": address_str(uid, n),
                     "sha256": hashlib.sha256(text.encode()).hexdigest()})
    manifest["fixtures"] = fixtures
    (d / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    for p in [d / "manifest.json", *d.rglob("*")]:
        if p.is_file(): p.chmod(0o444)  # read-only: a reminder that universes never change
    print(f"froze {uid}: {len(files)} files, {len(fixtures)} golden fixtures")


def verify(uid: str) -> bool:
    lib, m = load(uid)
    ok = True
    for fx in m["fixtures"]:
        _, n = address_int(fx["address"])
        text, canonical = lib.page_at(n)
        good = canonical and hashlib.sha256(text.encode()).hexdigest() == fx["sha256"]
        ok &= good
        print(f"{'ok  ' if good else 'FAIL'} {fx['kind']:6s} {fx['address'][:48]}…")
    print(f"{uid}: {'all fixtures reproduce' if ok else 'DOES NOT REPRODUCE: do not serve'}")
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["freeze", "verify", "page", "list"])
    ap.add_argument("arg", nargs="?")
    ap.add_argument("description", nargs="?", default="")
    ap.add_argument("--from-recommended", action="store_true")
    a = ap.parse_args()
    if a.cmd == "freeze": freeze(a.arg, a.description)
    elif a.cmd == "verify": sys.exit(0 if verify(a.arg) else 1)
    elif a.cmd == "page":
        uid, n = address_int(a.arg)
        lib, _ = load(uid)
        text, canonical = lib.page_at(n)
        print(text); print("─" * 80); print(address_str(uid, n) if canonical else "(non-canonical address)")
    else:
        for d in sorted(UNIVERSES.iterdir()):
            m = json.loads((d / "manifest.json").read_text())
            print(f"{m['id']:16s} {m['frozen'][:10]}  {m['status']}  {m['description']}")


if __name__ == "__main__":
    main()
