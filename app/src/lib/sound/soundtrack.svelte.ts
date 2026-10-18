/**
 * The city's soundtrack (lab/sound/soundtrack.py): a 210 s loop that plays under everything once it is turned
 * on. It starts off; turning it on (and its volume) is remembered on this device, and a remembered "on" starts
 * at the first touch or key, since browsers let sound start only then.
 *
 * The file holds one loop and a few seconds more; it loops a window one loop long that starts past the
 * codec's padding, and since the music is periodic, that window has no seam. Its bytes are fetched as soon as
 * a hand comes near the switch, so that turning it on is quick.
 */
import { asset } from '$app/paths';

const LOOP = 210,
	FROM = 0.5,
	ON = 'babel:musica',
	VOLUME = 'babel:volumen';

function read(key: string) {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}
function write(key: string, value: string) {
	try {
		localStorage.setItem(key, value);
	} catch {
		// not remembered, then
	}
}

class Soundtrack {
	on = $state(false);
	/** 0 to 1, as the slider shows it; the gain is its square, closer to how loudness is heard */
	volume = $state(0.7);
	#ctx: AudioContext | null = null;
	#gain: GainNode | null = null;
	#loading: Promise<void> | null = null;

	constructor() {
		if (typeof window === 'undefined') return;
		this.on = read(ON) === '1';
		const v = read(VOLUME);
		if (v !== null && Number(v) >= 0 && Number(v) <= 1) this.volume = Number(v);
		document.addEventListener('visibilitychange', () => {
			if (!this.#ctx) return;
			if (document.hidden) this.#ctx.suspend();
			else if (this.on) this.#ctx.resume();
		});
	}

	/** a touch or a key: if the music was left on, it starts again */
	wake() {
		if (this.on) void this.#start();
	}

	/**
	 * a hand near the switch: fetch and decode the music now, into a context that stays suspended (and
	 * silent) until it is turned on, so turning it on doesn't wait for either
	 */
	prefetch() {
		const ctx = this.#context();
		this.#loading ??= this.#load().then(() => {
			if (!this.on) void ctx.suspend();
		});
	}

	toggle() {
		this.on = !this.on;
		write(ON, this.on ? '1' : '0');
		if (this.on) void this.#start();
		else this.#fade(0, 0.5, () => !this.on && this.#ctx?.suspend());
	}

	setVolume(v: number) {
		this.volume = Math.min(1, Math.max(0, v));
		write(VOLUME, String(this.volume));
		if (this.on) this.#fade(this.volume ** 2, 0.08);
	}

	#context() {
		if (this.#ctx) return this.#ctx;
		this.#ctx = new AudioContext();
		this.#gain = this.#ctx.createGain();
		this.#gain.gain.value = 0;
		this.#gain.connect(this.#ctx.destination);
		return this.#ctx;
	}

	async #start() {
		await this.#context().resume();
		this.#loading ??= this.#load();
		await this.#loading;
		if (this.on) this.#fade(this.volume ** 2, 1.5);
	}

	async #load() {
		const ctx = this.#ctx!;
		const bytes = await (await fetch(asset('sound/biblioteca.mp3'))).arrayBuffer();
		const buffer = await ctx.decodeAudioData(bytes);
		const source = ctx.createBufferSource();
		source.buffer = buffer;
		source.loop = true;
		source.loopStart = FROM;
		source.loopEnd = FROM + LOOP;
		source.connect(this.#gain!);
		source.start(0, FROM);
	}

	#fade(to: number, seconds: number, then?: () => void) {
		const ctx = this.#ctx,
			g = this.#gain?.gain;
		if (!ctx || !g) return;
		const now = ctx.currentTime;
		g.cancelScheduledValues(now);
		g.setValueAtTime(g.value, now);
		g.linearRampToValueAtTime(to, now + seconds);
		if (then) setTimeout(then, seconds * 1000);
	}
}

export const soundtrack = new Soundtrack();
