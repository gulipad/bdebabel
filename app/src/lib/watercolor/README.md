# watercolor (vendored)

The watercolour simulation of [watercolor-playground](https://github.com/msurguy/watercolor-playground)
by Maksim Surguy (MIT), at commit `27ee4e62842f5a183647a85eb281b3845ce6db8e`, copied unchanged:

- `engine/`: the WebGL2 paper, water and pigment simulation and its renderer
- `draw/StrokeWriter.ts`: drives the brush along pen paths, stroke by stroke
- `text/`: single-line SVG fonts parsed into pen paths, and line layout

The fonts are in `app/static/fonts/single-line/`. Licences: [LICENSE](LICENSE) for this code, and
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for what it builds on (inkwash, WebGL-Fluid-Simulation,
spectral.js, water-brush: MIT) and for the fonts (SIL Open Font License 1.1, Hershey Fonts licence).

Keep these files byte-identical to upstream so they can be diffed and updated; our own code that drives
the engine lives one level up, in `../ink/`.
