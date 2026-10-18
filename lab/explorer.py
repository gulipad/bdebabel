# /// script
# requires-python = ">=3.12"
# dependencies = ["mlx-lm>=0.28", "transformers<5", "numpy", "sentencepiece", "protobuf"]
# ///
"""
The Library explorer: a local web app over a frozen universe.

Walk hexagons, walls, shelves, volumes and pages; jump to random pages, to the center or to any
address; search your own text. Every page shows its address, its distance from the center and
its ring.

    uv run lab/explorer.py [babel-exp-1] [--port 1941]
"""
import argparse, json, sys, threading, time, webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).parent))
from universe import UNIVERSES, address_of, load, number_of  # noqa: E402

LOCK = threading.Lock()  # one model, one page at a time
DEFAULT_RINGS = [  # until lab/distance.py has calibrated the universe
    {"name": "El Centro", "about": "Lo más previsible: fórmulas, repeticiones.", "from_bits": 0, "to_bits": 1900},
    {"name": "Los Barrios", "about": "Páginas de novela típicas: donde aterriza el paseo.", "from_bits": 1900, "to_bits": 3000},
    {"name": "Las Afueras", "about": "Páginas raras: nombres, giros extraños, otras lenguas.", "from_bits": 3000, "to_bits": 6000},
    {"name": "Los Confines", "about": "Fragmentos y ruido mezclado con palabras.", "from_bits": 6000, "to_bits": 14500},
    {"name": "El Vacío", "about": "Ruido puro: la biblioteca de Basile.", "from_bits": 14500, "to_bits": None},
]


class Library:
    def __init__(self, uid: str):
        self.lib, self.m = load(uid)
        f = UNIVERSES / uid / "rings.json"
        self.rings = json.loads(f.read_text())["rings"] if f.exists() else DEFAULT_RINGS

    def ring(self, bits: int) -> dict:
        for r in self.rings:
            if bits >= r["from_bits"] and (r["to_bits"] is None or bits < r["to_bits"]): return r
        return self.rings[-1]

    def describe(self, text: str, here: int | None = None) -> dict:
        """Everything the page view needs. `here` is the number of the location being visited."""
        n = self.lib.page_encode(text)
        bits = n.bit_length()
        return {"text": text, "catalogued": address_of(self.m, n), "here": address_of(self.m, here if here is not None else n),
                "is_catalogued": here is None or here == n, "distance": bits, "ring": self.ring(bits)}

    def open(self, address: str) -> dict:
        n = number_of(self.m, address)
        text, _ = self.lib.page_decode(n)
        return self.describe(text, here=n)

    def random(self) -> dict:
        return self.describe(self.lib.random_page(str(time.time_ns())))

    def search(self, query: str, seed: str) -> dict:
        page, at = self.lib.search(query, seed)
        from lm_library import normalize
        q, removed = normalize(query)
        out = self.describe(page)
        out.update({"query": q.strip(), "removed": removed, "seed": seed})
        return out


PAGE = r"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>La Biblioteca de Babel</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;1,500&family=Literata:opsz,wght@7..72,400;7..72,600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root { --bg:#14171a; --panel:#1b1f23; --page:#ece6da; --ink:#1d1b18; --text:#d9dde0; --muted:#8c969e; --rule:#2c3238; --accent:#d2a24c;
        --display:"Cormorant Garamond", Georgia, serif; --body:"Literata", Georgia, serif; --mono:"IBM Plex Mono", Menlo, monospace; }
* { box-sizing:border-box } body { margin:0; background:var(--bg); color:var(--text); font:15px/1.5 var(--body) }
.wrap { max-width:1200px; margin:0 auto; padding:28px 20px 60px; display:grid; gap:22px }
header { display:flex; flex-wrap:wrap; gap:12px 24px; align-items:baseline; justify-content:space-between }
h1 { font:500 2.4rem/1 var(--display); margin:0; letter-spacing:.01em } h1 i { color:var(--accent) }
.universe { font:500 .78rem var(--mono); color:var(--muted); letter-spacing:.08em; text-transform:uppercase }
.layout { display:grid; grid-template-columns:330px minmax(0,1fr); gap:24px; align-items:start }
@media (max-width:900px) { .layout { grid-template-columns:1fr } }
.panel { background:var(--panel); border:1px solid var(--rule); border-radius:6px; padding:16px; display:grid; gap:14px }
label, .label { font:500 .7rem var(--mono); letter-spacing:.1em; text-transform:uppercase; color:var(--muted) }
input, select, textarea, button { font:inherit; color:var(--text) }
textarea, input[type=text] { width:100%; background:#101316; border:1px solid var(--rule); border-radius:4px; padding:8px 10px }
textarea { min-height:70px; resize:vertical; font-family:var(--body) }
button { background:#262c32; border:1px solid var(--rule); border-radius:4px; padding:7px 11px; cursor:pointer }
button:hover { border-color:var(--accent) } button.primary { background:var(--accent); color:#1b1408; border-color:var(--accent); font-weight:600 }
button:disabled { opacity:.5; cursor:wait } button:focus-visible, select:focus-visible { outline:2px solid var(--accent); outline-offset:2px }
.row { display:flex; flex-wrap:wrap; gap:8px; align-items:center }
.coords { display:grid; grid-template-columns:repeat(4,1fr); gap:8px }
.coords div { display:grid; gap:4px } select { background:#101316; border:1px solid var(--rule); border-radius:4px; padding:6px }
.book { background:var(--page); color:var(--ink); border-radius:3px; padding:clamp(22px,4vw,52px); min-height:60vh; box-shadow:0 18px 40px #0007; position:relative }
.book pre { margin:0; white-space:pre-wrap; overflow-wrap:anywhere; font:16px/1.75 var(--body); max-width:68ch }
.book mark { background:#f2cf6b; color:inherit; padding:0 2px }
.where { font:500 .8rem var(--mono); color:var(--muted); display:flex; flex-wrap:wrap; gap:6px 14px }
.where b { color:var(--text); font-weight:500 }
.ring { display:grid; gap:4px; border-left:3px solid var(--accent); padding:4px 0 4px 12px }
.ring strong { font:500 1.4rem var(--display) } .ring span { color:var(--muted); font-size:.9rem }
.addr { font:400 .72rem/1.4 var(--mono); color:var(--muted); word-break:break-all; max-height:5.6em; overflow:auto; background:#101316; border-radius:4px; padding:8px }
.note { font-size:.85rem; color:var(--muted) } .warn { color:var(--accent) }
.busy { position:absolute; inset:0; display:none; place-items:center; background:#ece6dadd; font:italic 500 1.5rem var(--display); color:#5a5246 }
.busy.on { display:grid }
</style></head>
<body><div class="wrap">
<header><h1>La Biblioteca de <i>Babel</i></h1><span class="universe" id="universe"></span></header>
<div class="layout">
  <aside class="panel">
    <div class="ring" id="ring"><strong>—</strong><span>Abre una página para saber dónde estás.</span></div>
    <div class="where" id="where"></div>
    <div class="coords">
      <div><label for="wall">Muro</label><select id="wall"></select></div>
      <div><label for="shelf">Anaquel</label><select id="shelf"></select></div>
      <div><label for="volume">Volumen</label><select id="volume"></select></div>
      <div><label for="page">Página</label><select id="page"></select></div>
    </div>
    <div class="row">
      <button id="prev">← página</button><button id="next">página →</button>
      <button id="hexprev">← hexágono</button><button id="hexnext">hexágono →</button>
    </div>
    <div class="row"><button class="primary" id="random">Página al azar</button><button id="center">Ir al centro</button></div>
    <div><span class="label">Dirección de esta página</span><div class="addr" id="addr">—</div></div>
    <div class="row"><button id="copy">Copiar dirección</button></div>
    <div><label for="goto">Abrir una dirección</label><input type="text" id="goto" placeholder="babel-exp-1:…:muro:anaquel:volumen:página"></div>
    <div class="row"><button id="open">Abrir</button></div>
    <div><label for="q">Buscar un texto</label><textarea id="q" placeholder="Hoy me desperté pensando en ti…"></textarea></div>
    <div class="row"><button class="primary" id="search">Buscar</button><button id="more" disabled>Otra coincidencia</button></div>
    <p class="note" id="status"></p>
  </aside>
  <main><div class="book"><pre id="text">La Biblioteca te espera. Pide una página al azar, busca un texto o escribe una dirección.</pre><div class="busy" id="busy">El bibliotecario escribe…</div></div></main>
</div></div>
<script>
const $ = id => document.getElementById(id);
const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
let current = null, lastQuery = null, seed = 0;
for (const [id, n] of [["wall",4],["shelf",5],["volume",32],["page",410]])
  $(id).innerHTML = Array.from({length:n}, (_, i) => `<option>${i+1}</option>`).join("");

function parse(addr) { const [u, h, w, s, v, p] = addr.split(":"); return {u, h, w:+w, s:+s, v:+v, p:+p}; }
function fmt(a) { return `${a.u}:${a.h}:${a.w}:${a.s}:${a.v}:${a.p}`; }
function hexStep(h, d) {
  let n = 0n; for (const c of h) n = n * 62n + BigInt(B62.indexOf(c));
  n += BigInt(d); if (n < 0n) n = 0n;
  let s = ""; do { s = B62[Number(n % 62n)] + s; n /= 62n; } while (n > 0n); return s;
}
function busy(on) { $("busy").classList.toggle("on", on); document.querySelectorAll("button").forEach(b => b.disabled = on || (b.id === "more" && !lastQuery)); }
async function call(url, opts) {
  busy(true); $("status").textContent = "";
  try { const r = await fetch(url, opts); const j = await r.json(); if (!r.ok) throw new Error(j.error || r.statusText); show(j); }
  catch (e) { $("status").innerHTML = `<span class="warn">${e.message}</span>`; }
  finally { busy(false); }
}
function esc(s) { return s.replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])); }
function show(j) {
  current = parse(j.here);
  let html = esc(j.text);
  if (j.query) {
    const i = j.text.toLowerCase().indexOf(j.query.toLowerCase());
    if (i >= 0) html = esc(j.text.slice(0, i)) + "<mark>" + esc(j.text.slice(i, i + j.query.length)) + "</mark>" + esc(j.text.slice(i + j.query.length));
  }
  $("text").innerHTML = html;
  $("ring").innerHTML = `<strong>${j.ring.name}</strong><span>${j.ring.about} · a ${j.distance.toLocaleString("es")} pasos del centro</span>`;
  $("where").innerHTML = `<span>muro <b>${current.w}</b></span><span>anaquel <b>${current.s}</b></span><span>volumen <b>${current.v}</b></span><span>página <b>${current.p}</b></span><span>hexágono <b>${current.h.length > 14 ? current.h.slice(0,10) + "…" : current.h}</b> (${current.h.length} car.)</span>`;
  $("addr").textContent = j.here;
  for (const [id, k] of [["wall","w"],["shelf","s"],["volume","v"],["page","p"]]) $(id).value = current[k];
  const notes = [];
  if (!j.is_catalogued) notes.push(`Esta es una copia: la página está catalogada en ${j.catalogued.slice(0, 48)}…`);
  if (j.removed) notes.push(`<span class="warn">La Biblioteca solo guarda el alfabeto latino: se omitió ${esc(j.removed)}</span>`);
  if (j.query) notes.push(`Coincidencia ${(+j.seed) + 1}.`);
  $("status").innerHTML = notes.join("<br>");
  history.replaceState(null, "", "#" + encodeURIComponent(j.here));
}
function go(a) { call("/api/page?addr=" + encodeURIComponent(fmt(a))); }
function move(field, delta, max) {
  if (!current) return; const a = {...current}; a[field] += delta;
  if (a[field] < 1) a[field] = max; if (a[field] > max) a[field] = 1; go(a);
}
$("prev").onclick = () => move("p", -1, 410); $("next").onclick = () => move("p", 1, 410);
$("hexprev").onclick = () => current && go({...current, h: hexStep(current.h, -1)});
$("hexnext").onclick = () => current && go({...current, h: hexStep(current.h, 1)});
for (const [id, k] of [["wall","w"],["shelf","s"],["volume","v"],["page","p"]]) $(id).onchange = () => current && go({...current, [k]: +$(id).value});
$("random").onclick = () => { lastQuery = null; call("/api/random"); };
$("center").onclick = () => { lastQuery = null; call("/api/page?addr=" + encodeURIComponent(UNIVERSE + ":0:1:1:1:1")); };
$("open").onclick = () => { lastQuery = null; call("/api/page?addr=" + encodeURIComponent($("goto").value.trim())); };
$("search").onclick = () => { lastQuery = $("q").value; seed = 0; if (lastQuery.trim()) call("/api/search", {method:"POST", body: JSON.stringify({query:lastQuery, seed:"0"})}); };
$("more").onclick = () => { if (!lastQuery) return; seed += 1; call("/api/search", {method:"POST", body: JSON.stringify({query:lastQuery, seed:String(seed)})}); };
$("copy").onclick = async () => { try { await navigator.clipboard.writeText($("addr").textContent); $("status").textContent = "Dirección copiada."; } catch { getSelection().selectAllChildren($("addr")); } };
const UNIVERSE = "__UNIVERSE__"; $("universe").textContent = "universo " + UNIVERSE;
if (location.hash.length > 1) call("/api/page?addr=" + location.hash.slice(1));
</script></body></html>"""


def make_handler(library: Library):
    class Handler(BaseHTTPRequestHandler):
        def _json(self, code: int, obj: dict):
            body = json.dumps(obj, ensure_ascii=False).encode()
            self.send_response(code); self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)

        def _run(self, fn):
            try:
                with LOCK: self._json(200, fn())
            except (ValueError, IndexError) as e:
                self._json(400, {"error": f"Dirección no válida: {e}"})

        def do_GET(self):
            u = urlparse(self.path)
            if u.path == "/":
                body = PAGE.replace("__UNIVERSE__", library.m["id"]).encode()
                self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
            elif u.path == "/api/page":
                addr = parse_qs(u.query).get("addr", [""])[0]
                self._run(lambda: library.open(addr))
            elif u.path == "/api/random":
                self._run(library.random)
            else:
                self.send_error(404)

        def do_POST(self):
            if urlparse(self.path).path != "/api/search": return self.send_error(404)
            data = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            query = str(data.get("query", ""))[:3000]
            if not query.strip(): return self._json(400, {"error": "Escribe algo para buscar."})
            self._run(lambda: library.search(query, str(data.get("seed", "0"))))

        def log_message(self, *args):
            pass

    return Handler


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("universe", nargs="?", default="babel-exp-1")
    ap.add_argument("--port", type=int, default=1941)
    ap.add_argument("--no-browser", action="store_true")
    a = ap.parse_args()
    print(f"loading {a.universe}…", flush=True)
    library = Library(a.universe)
    server = ThreadingHTTPServer(("127.0.0.1", a.port), make_handler(library))
    url = f"http://127.0.0.1:{a.port}/"
    print(f"La Biblioteca de Babel ({a.universe}) en {url}", flush=True)
    if not a.no_browser: webbrowser.open(url)
    server.serve_forever()


if __name__ == "__main__":
    main()
