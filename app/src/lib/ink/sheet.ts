/**
 * A sheet of watercolour paper and an invisible hand that writes on it: our driver over the vendored
 * watercolor-playground engine (src/lib/watercolor, MIT). The engine simulates the paper, the water and the
 * pigment; the hand feeds it pen paths from single-line fonts, stroke by stroke, so letters are written in
 * wet ink that bleeds a little and dries into the paper.
 */
import { WatercolorEngine } from '#lib/watercolor/engine/Engine.ts';
import { BRUSH_PRESETS, buildBrush } from '#lib/watercolor/engine/brushes.ts';
import { PAPERS, type PaperPreset } from '#lib/watercolor/engine/papers.ts';
import { pigmentFromHex } from '#lib/watercolor/engine/spectral.ts';
import { StrokeWriter } from '#lib/watercolor/draw/StrokeWriter.ts';
import { loadFont } from '#lib/watercolor/text/fontLoader.ts';
import { fontUrl } from '#lib/watercolor/text/fonts.ts';
import { layoutText, type Align } from '#lib/watercolor/text/layout.ts';

/** Inks of the city, as watercolour pigments. */
export const INKS = {
	sepia: { name: 'Sepia', hex: '#5b3a22' },
	irongall: { name: 'Tinta ferrogálica', hex: '#2e2620' },
	indigo: { name: 'Índigo', hex: '#28396e' },
	madder: { name: 'Granza', hex: '#9c3b30' }
} as const;
export type InkId = keyof typeof INKS;

/** Single-line fonts that read as handwriting, from the vendored set. */
export const HANDS = {
	HersheyScript1Smooth: 'Hershey Script (suave)',
	HersheyScriptMed: 'Hershey Script (media)',
	EMSAllure: 'EMS Allure',
	EMSDecorousScript: 'EMS Decorous Script',
	ShriinivasCustom: 'Custom Script',
	EMSBirdSwashCaps: 'EMS Bird (capitulares)',
	HersheyGothItalian: 'Hershey Gótica italiana'
} as const;
export type HandId = keyof typeof HANDS;

export const PAPER_IDS = PAPERS.map((p) => ({ id: p.id, name: p.name }));
export const BRUSH_IDS = BRUSH_PRESETS.map((b) => ({ id: b.id, name: b.name }));

export interface WriteOptions {
	hand: HandId;
	/** where the baseline is anchored, in sheet uv (0..1, y up) */
	at: [number, number];
	align: Align;
	/** letter height (em) in sheet heights */
	size: number;
	/** pen speed in sheet heights per second */
	speed: number;
	pressure: number;
	/** 0..1: how much the pressure eases in and out at stroke ends */
	taper: number;
	/** 0..1: tremor of the hand */
	wobble: number;
}

export const DEFAULT_WRITE: WriteOptions = {
	hand: 'HersheyScript1Smooth',
	at: [0.5, 0.5],
	align: 'center',
	size: 0.09,
	speed: 0.3,
	pressure: 0.6,
	taper: 0.5,
	wobble: 0.2
};

/** Widest brush footprint for text, in em: thinner than a letter's counters (as upstream). */
const MAX_RADIUS_EM = 0.06;

export class InkSheet {
	readonly engine: WatercolorEngine;
	readonly writer: StrokeWriter;
	private onResize = () => this.engine.resize();

	constructor(
		canvas: HTMLCanvasElement,
		{ paper = 'cold', ink = 'sepia' as InkId, brush = 'round' } = {}
	) {
		this.engine = new WatercolorEngine(canvas, null);
		this.writer = new StrokeWriter(this.engine);
		this.setPaper(paper);
		this.setInk(ink);
		this.setBrush(brush);
		// ink, not a wash: a loaded brush that carries a little less water than upstream's default
		this.engine.setParams({ load: 0.85, water: 0.5 });
		addEventListener('resize', this.onResize);
	}

	/** Pigment concentration and water on the brush, 0..1 (the engine's own sliders). */
	setLoad(load: number, water: number) {
		this.engine.setParams({ load, water });
	}

	setPaper(id: string) {
		const p = PAPERS.find((x) => x.id === id);
		if (p) this.engine.setPaper(p);
	}
	/** Any paper: one of the engine's presets, or a variation of one (a different tint, relief or mottle). */
	setPaperPreset(p: PaperPreset) {
		this.engine.setPaper(p);
	}
	setInk(id: InkId) {
		this.engine.setPigment(pigmentFromHex(INKS[id].hex));
	}
	setBrush(id: string) {
		const b = BRUSH_PRESETS.find((x) => x.id === id);
		if (b) this.engine.setBrush(buildBrush(b));
	}

	get writing() {
		return this.writer.busy;
	}

	/** Writes one line of text with the brush, stroke by stroke; resolves when the last stroke is down. */
	async write(
		text: string,
		o: Partial<WriteOptions> = {},
		onProgress?: (done: number, total: number) => void
	) {
		const opts = { ...DEFAULT_WRITE, ...o };
		const font = await loadFont(opts.hand, fontUrl(opts.hand));
		const layout = layoutText(text, font, 0, opts.align);
		const em = opts.size;
		// em units (y down) -> sheet heights relative to the anchor (y up)
		const strokes = layout.strokes.map((pl) =>
			pl.map(([x, y]) => [x * em, -y * em] as [number, number])
		);
		await new Promise<void>((resolve) =>
			this.writer.write(
				strokes,
				opts.at,
				{
					tool: 'brush',
					ref: em,
					maxRadius: em * MAX_RADIUS_EM,
					speed: opts.speed,
					pressure: opts.pressure,
					taper: opts.taper,
					wobble: opts.wobble,
					label: text
				},
				{ onProgress, onDone: () => resolve() }
			)
		);
	}

	stop() {
		this.writer.cancel();
	}
	/** Dries the sheet at once, so new ink glazes over without disturbing what is there. */
	dry() {
		this.engine.fix();
	}
	clear() {
		this.writer.cancel();
		this.engine.clear();
	}
	destroy() {
		this.writer.cancel();
		removeEventListener('resize', this.onResize);
		this.engine.destroy();
	}
}
