/**
 * The pool of ink (`pool` in pen.ts), drawn live on the GPU so that its edge can creep: the same recipe, with
 * the noise its edge wanders by flowing slowly round a circle, so the motion is continuous and loops without a
 * seam. It draws the ink alone, as a transmittance on white (what `compose` makes on a white sheet), ready to be
 * multiplied onto the paper; the paper's tooth and the reserve are read from a texture made once.
 */
import { context, fullscreen, program } from '#lib/gl/gl.ts';
import type { Paper } from './pen.ts';

const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uTex; // r: the paper's tooth, g: the reserve kept from the ink (soft), b: its halo
uniform vec2 uOrigin, uSize, uCenter, uDrift;
uniform float uR, uU;
uniform vec3 uInk;
out vec4 o;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
	vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

void main() {
	vec2 q = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y); // px in this canvas, y down
	vec4 t = texelFetch(uTex, ivec2(q), 0);
	vec2 p = uOrigin + q, d = abs(p - uCenter);
	float u = uU, apothem = uR * 0.8660254;
	// distance to a flat-topped hexagon's edge (negative inside), wandering, and the wandering flows
	float edge = max(d.y - apothem, d.x * 0.8660254 + d.y * 0.5 - apothem)
		+ (vnoise(p / (45.0 * u) + uDrift + vec2(3.1, 7.7)) - 0.5) * 16.0 * u
		+ (vnoise(p / (11.0 * u) + uDrift.yx * 0.6 + vec2(5.3, 1.9)) - 0.5) * 5.0 * u;
	float inside = clamp(0.5 - edge / (1.2 * u), 0.0, 1.0), depth = max(0.0, -edge);
	float dens = inside * (0.6
		+ 0.32 * exp(-depth / (5.0 * u))
		+ 0.14 * exp(-pow((depth - 24.0 * u) / (3.0 * u), 2.0))
		+ (vnoise(p / (70.0 * u) + uDrift.yx * 0.5 + vec2(9.4, 2.6)) - 0.5) * 0.16);
	// wicked into the raised fibres just past the edge
	if (edge > 0.0) dens += 0.55 * exp(-edge / (1.6 * u)) * clamp((t.r - 0.45) / 0.35, 0.0, 1.0);
	// kept from the ink where the reserve is, pooling a little darker against it
	float kept = t.g, against = max(0.0, t.b - kept);
	dens = dens * (1.0 - min(1.0, kept * 1.15)) + inside * against * 0.35 * (1.0 - kept);
	// as compose: the tooth granulates it (tooth 0.5), multiplied onto white
	float a = min(1.0, min(1.0, dens) * (1.0 - 0.5 * (t.r - 0.45)));
	o = vec4(1.0 - a * (1.0 - uInk), 1.0);
}`;

export interface LivePool {
	canvas: HTMLCanvasElement;
	/** draws the pool with its edge's noise moved by `drift` (lattice cells) */
	draw(drift: [number, number]): void;
}

/** A live pool over `rect` of the sheet (px), or null without WebGL2. */
export function livePool(
	paper: Paper,
	{
		cx,
		cy,
		r,
		unit,
		reserve,
		rect,
		ink
	}: {
		cx: number;
		cy: number;
		r: number;
		unit: number;
		reserve: CanvasRenderingContext2D;
		rect: { x: number; y: number; w: number; h: number };
		ink: [number, number, number];
	}
): LivePool | null {
	const canvas = document.createElement('canvas');
	canvas.width = rect.w;
	canvas.height = rect.h;
	const gl = context(canvas, { preserveDrawingBuffer: true });
	if (!gl) return null;
	let p: WebGLProgram;
	try {
		p = program(gl, FRAGMENT);
	} catch {
		return null;
	}
	fullscreen(gl);
	gl.useProgram(p);

	// the tooth and the reserve (softened, and its wider halo), packed into one texture
	const blurred = (px: number) => {
		const c = document.createElement('canvas');
		c.width = rect.w;
		c.height = rect.h;
		const g = c.getContext('2d', { willReadFrequently: true })!;
		g.filter = `blur(${px}px)`;
		g.drawImage(reserve.canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
		return g.getImageData(0, 0, rect.w, rect.h).data;
	};
	const soft = blurred(0.7 * unit),
		halo = blurred(3 * unit);
	const tex = new Uint8Array(rect.w * rect.h * 4);
	for (let y = 0; y < rect.h; y++)
		for (let x = 0; x < rect.w; x++) {
			const i = y * rect.w + x,
				sx = Math.min(paper.w - 1, Math.max(0, rect.x + x)),
				sy = Math.min(paper.h - 1, Math.max(0, rect.y + y));
			tex[i * 4] = paper.grain[sy * paper.w + sx] * 255;
			tex[i * 4 + 1] = soft[i * 4 + 3];
			tex[i * 4 + 2] = halo[i * 4 + 3];
			tex[i * 4 + 3] = 255;
		}
	gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
	gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, rect.w, rect.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, tex);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

	const at = (name: string) => gl.getUniformLocation(p, name);
	gl.uniform1i(at('uTex'), 0);
	gl.uniform2f(at('uOrigin'), rect.x, rect.y);
	gl.uniform2f(at('uSize'), rect.w, rect.h);
	gl.uniform2f(at('uCenter'), cx, cy);
	gl.uniform1f(at('uR'), r);
	gl.uniform1f(at('uU'), unit);
	gl.uniform3f(at('uInk'), ink[0] / 255, ink[1] / 255, ink[2] / 255);
	const uDrift = at('uDrift');
	gl.viewport(0, 0, rect.w, rect.h);

	return {
		canvas,
		draw([dx, dy]) {
			gl.uniform2f(uDrift, dx, dy);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		}
	};
}
