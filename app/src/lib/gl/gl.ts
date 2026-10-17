/** A thin typed layer over WebGL2: full-screen passes are all the city needs. */

const VERT = `#version 300 es
in vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;

export function context(canvas: HTMLCanvasElement): WebGL2RenderingContext | null {
	return canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false });
}

export function program(gl: WebGL2RenderingContext, fragment: string): WebGLProgram {
	const compile = (type: number, src: string) => {
		const s = gl.createShader(type)!;
		gl.shaderSource(s, src);
		gl.compileShader(s);
		if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
			throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
		return s;
	};
	const p = gl.createProgram()!;
	gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
	gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fragment));
	gl.bindAttribLocation(p, 0, 'a');
	gl.linkProgram(p);
	if (!gl.getProgramParameter(p, gl.LINK_STATUS))
		throw new Error(gl.getProgramInfoLog(p) ?? 'link');
	return p;
}

/** Binds a quad covering the viewport to attribute 0; draw it with drawArrays(TRIANGLE_STRIP, 0, 4). */
export function fullscreen(gl: WebGL2RenderingContext): void {
	const b = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, b);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
	gl.enableVertexAttribArray(0);
	gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
}

/** Matches the canvas's pixel size to its CSS size times `scale`; returns true when it changed. */
export function fit(canvas: HTMLCanvasElement, scale = 1): boolean {
	const r = canvas.getBoundingClientRect();
	const d = Math.min(window.devicePixelRatio || 1, 2) * scale;
	const w = Math.max(2, Math.round(r.width * d));
	const h = Math.max(2, Math.round(r.height * d));
	if (canvas.width === w && canvas.height === h) return false;
	canvas.width = w;
	canvas.height = h;
	return true;
}
