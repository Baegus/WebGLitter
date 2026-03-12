import { DEFAULT_CONFIG } from "./modules/presets.js";

const debugging = process.env.DEBUG == "true";

class WebGLitter {
	constructor(canvas, config = {}) {
		this.canvas = canvas;
		this.gl = canvas.getContext("webgl2", { antialias: false, alpha: true });
		
		if (!this.gl) {
			throw new Error("WebGL 2 is not supported in this browser.");
		}

		this.config = {
			...DEFAULT_CONFIG,
			...config
		};

		this.lastTime = performance.now();
		this.spawnRemainder = 0;
		this.paused = false;
		this.emitting = true;

		this.degToRad = Math.PI / 180.0;


		this.pointer = { normalizedX: 0.5, normalizedY: 0.5, active: false };
		
		this.handlePointerMove = (e) => {
			const rect = this.canvas.getBoundingClientRect();
			this.pointer.normalizedX = (e.clientX - rect.left) / rect.width;
			this.pointer.normalizedY = (e.clientY - rect.top) / rect.height;
			this.pointer.active = true;
		};
		this.handlePointerLeave = (e) => {
			// For mouse, only deactivate on leave. For touch/pen, deactivate on up/leave/cancel.
			if (e && e.type === "pointerup" && e.pointerType === "mouse") return;
			this.pointer.active = false;
		};
		
		this.canvas.addEventListener("pointermove", this.handlePointerMove);
		this.canvas.addEventListener("pointerdown", this.handlePointerMove);
		this.canvas.addEventListener("pointerleave", this.handlePointerLeave);
		this.canvas.addEventListener("pointerup", this.handlePointerLeave);
		this.canvas.addEventListener("pointercancel", this.handlePointerLeave);

		this.initWebGL();
		this.initParticles();

		if (this.config.colorGradient || this.config.opacityGradient || this.config.scaleGradient) {
			this.updateGradientTexture();
		}
		if (this.config.particleImage || this.config.particleShape === "image") {
			this.updateParticleImage();
		}

		this.render = this.render.bind(this);
		this.animationFrameId = requestAnimationFrame(this.render);
	}

	/** Pause the animation loop entirely (no updates, no rendering). */
	pause() {
		if (this.paused) return;
		this.paused = true;
		cancelAnimationFrame(this.animationFrameId);
		this.animationFrameId = null;
	}

	/** Resume a paused animation loop. */
	resume() {
		if (!this.paused) return;
		this.paused = false;
		this.lastTime = performance.now(); // Prevent a huge dt jump after a long pause
		this.animationFrameId = requestAnimationFrame(this.render);
	}

	/** Stop spawning new particles; existing particles keep animating until they die. */
	stopEmitting() {
		this.emitting = false;
	}

	/** Resume spawning new particles. */
	startEmitting() {
		this.emitting = true;
	}

	updateConfig(newConfig) {
		const oldShape = this.config.particleShape;
		const oldMax = this.config.maxParticles;
		this.config = { ...this.config, ...newConfig };

		if (newConfig.maxParticles !== undefined && newConfig.maxParticles !== oldMax) {
			this.initParticles();
		}

		if (oldShape !== this.config.particleShape) {
			this.initRenderProgram();
			if (this.config.particleShape === "image") {
				this.updateParticleImage();
			}
		}
		if (newConfig.blendMode !== undefined) {
			this.applyBlendMode();
		}
		if (newConfig.colorGradient !== undefined || newConfig.opacityGradient !== undefined || newConfig.scaleGradient !== undefined) {
			this.updateGradientTexture();
		}
		if (newConfig.particleImage !== undefined) {
			this.updateParticleImage();
		}
	}

	restart() {
		const max = this.config.maxParticles;
		for (let i = 0; i < max; i++) {
			this.cpuData[i * 7 + 4] = 9999; // Force instant spawn
			this.cpuData[i * 7 + 5] = 1;
			this.cpuData[i * 7 + 6] = Math.random() * Math.PI * 2;
		}
		this.activeParticles = 0;
		this.lastTime = performance.now();
	}

	updateGradientTexture() {
		const gl = this.gl;
		const width = 256;

		// Sample a sorted gradient stops array at t in [0,1].
		// value format: [r(0-255), g(0-255), b(0-255), a(0-1)]
		const sampleGradient = (stops, t) => {
			if (t <= stops[0].time) return stops[0].value;
			const last = stops[stops.length - 1];
			if (t >= last.time) return last.value;
			let lo = 0;
			while (lo < stops.length - 2 && stops[lo + 1].time <= t) lo++;
			const a = stops[lo], b = stops[lo + 1];
			const f = (t - a.time) / (b.time - a.time);
			return [
				a.value[0] + f * (b.value[0] - a.value[0]),
				a.value[1] + f * (b.value[1] - a.value[1]),
				a.value[2] + f * (b.value[2] - a.value[2]),
				a.value[3] + f * (b.value[3] - a.value[3]),
			];
		};

		const defaultWhite = [{ time: 0, value: [255, 255, 255, 1] }, { time: 1, value: [255, 255, 255, 1] }];
		const colorStops   = (this.config.colorGradient   && this.config.colorGradient.length   > 0) ? [...this.config.colorGradient].sort((a, b)   => a.time - b.time) : defaultWhite;
		const opacityStops = (this.config.opacityGradient && this.config.opacityGradient.length > 0) ? [...this.config.opacityGradient].sort((a, b) => a.time - b.time) : defaultWhite;
		const scaleStops   = (this.config.scaleGradient   && this.config.scaleGradient.length   > 0) ? [...this.config.scaleGradient].sort((a, b)   => a.time - b.time) : defaultWhite;

		const finalData = new Uint8Array(width * 4);
		const scaleData = new Uint8Array(width * 4);
		const inv = 1 / (width - 1);
		for (let i = 0; i < width; i++) {
			const t = i * inv;
			const c = sampleGradient(colorStops, t);
			const o = sampleGradient(opacityStops, t);
			const s = sampleGradient(scaleStops, t);

			finalData[i * 4 + 0] = c[0] + 0.5 | 0;
			finalData[i * 4 + 1] = c[1] + 0.5 | 0;
			finalData[i * 4 + 2] = c[2] + 0.5 | 0;
			finalData[i * 4 + 3] = (c[3] * o[3] * 255 + 0.5) | 0;

			scaleData[i * 4 + 0] = 255;
			scaleData[i * 4 + 1] = 255;
			scaleData[i * 4 + 2] = 255;
			scaleData[i * 4 + 3] = (s[3] * 255 + 0.5) | 0;
		}

		if (!this.gradientTexture) this.gradientTexture = gl.createTexture();

		gl.bindTexture(gl.TEXTURE_2D, this.gradientTexture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, finalData);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

		if (!this.scaleTexture) this.scaleTexture = gl.createTexture();

		gl.bindTexture(gl.TEXTURE_2D, this.scaleTexture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, scaleData);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	}

	createFallbackParticleTexture() {
		// A simple soft circle texture
		const gl = this.gl;
		const size = 32;
		const canvas = document.createElement("canvas");
		canvas.width = size;
		canvas.height = size;
		const ctx = canvas.getContext("2d");

		const cx = size / 2;
		const r = size / 2;
		const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, r);
		grad.addColorStop(0.0, "rgba(255,255,255,1)");
		grad.addColorStop(0.5, "rgba(255,255,255,0.8)");
		grad.addColorStop(1.0, "rgba(255,255,255,0)");
		ctx.fillStyle = grad;
		ctx.fillRect(0, 0, size, size);

		if (!this.particleTexture) this.particleTexture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, this.particleTexture);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
		gl.generateMipmap(gl.TEXTURE_2D);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	}

	updateParticleImage() {
		const gl = this.gl;
		if (!this.config.particleImage) {
			this.createFallbackParticleTexture();
			return;
		}

		const img = new Image();
		img.onload = () => {
			if (!this.particleTexture) this.particleTexture = gl.createTexture();
			gl.bindTexture(gl.TEXTURE_2D, this.particleTexture);
			gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
			gl.generateMipmap(gl.TEXTURE_2D);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		};
		img.src = this.config.particleImage;
	}

	initWebGL() {
		const gl = this.gl;
		this.uniforms = { render: {} };

		this.renderVsSource = `#version 300 es
		precision mediump float;

		layout(location = 0) in vec2 a_position;
		layout(location = 1) in vec2 a_ageAndScale;

		uniform vec2 u_rcpResolution;
		uniform float u_size;
		uniform float u_scaleMode; // 0=constant, 1=variable, 2=random
		uniform sampler2D u_gradientTexture;
		uniform sampler2D u_scaleTexture;

		out lowp vec4 v_color;

		void main() {
			float a_normalizedAge = a_ageAndScale.x;
			float a_baseScale = a_ageAndScale.y;

			if (a_normalizedAge > 1.0) {
				gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
				return;
			}
			vec2 clipSpace = a_position * u_rcpResolution - 1.0;
			clipSpace.y = -clipSpace.y;
			
			gl_Position = vec4(clipSpace, 0.0, 1.0);
			
			float scale = texture(u_scaleTexture, vec2(a_normalizedAge, 0.5)).a * a_baseScale;
			gl_PointSize = u_size * scale;
			
			v_color = texture(u_gradientTexture, vec2(a_normalizedAge, 0.5));
		}
		`;

		this.initRenderProgram();

		// Set initial blend state
		this.applyBlendMode();
	}

	applyBlendMode() {
		const gl = this.gl;
		gl.enable(gl.BLEND);
		switch (this.config.blendMode) {
			case "normal":
				gl.blendEquation(gl.FUNC_ADD);
				gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
				break;
			case "screen":
				gl.blendEquation(gl.FUNC_ADD);
				gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
				break;
			case "additive":
			default:
				gl.blendEquation(gl.FUNC_ADD);
				gl.blendFunc(gl.ONE, gl.ONE);
				break;
		}
	}

	initRenderProgram() {
		const gl = this.gl;
		if (this.renderProgram) gl.deleteProgram(this.renderProgram);

		const shape = this.config.particleShape;
		const useCircle = shape === "circle";
		const useSoftCircle = shape === "softCircle";
		const useImage = shape === "image";

		const renderFsSource = `#version 300 es
		precision lowp float;

		in vec4 v_color;
		out vec4 outColor;

		uniform vec2 u_shapeScale;
		${useImage ? "uniform sampler2D u_particleTexture;" : ""}

		void main() {
			vec2 coord = (gl_PointCoord - 0.5) / u_shapeScale;
			if (abs(coord.x) > 0.5 || abs(coord.y) > 0.5) discard;
			
			vec4 color = v_color;

			${useCircle ? `
			if (dot(coord, coord) > 0.25) discard;
			` : ""}

			${useSoftCircle ? `
			float dist = length(coord);
			float alpha = clamp(1.0 - dist * 2.0, 0.0, 1.0);
			alpha = alpha * alpha * (3.0 - 2.0 * alpha);
			color.a *= alpha;
			if (color.a <= 0.0) discard;
			` : ""}
			
			${useImage ? `
			vec2 texCoord = vec2(coord.x + 0.5, 1.0 - (coord.y + 0.5));
			color *= texture(u_particleTexture, texCoord);
			` : ""}
			
			if (color.a <= 0.005) discard;
			outColor = vec4(color.rgb * color.a, color.a);
		}
		`;

		this.renderProgram = this.createProgram(this.renderVsSource, renderFsSource);

		this.uniforms.render = {
			rcpResolution: gl.getUniformLocation(this.renderProgram, "u_rcpResolution"),
			size: gl.getUniformLocation(this.renderProgram, "u_size"),
			scaleMode: gl.getUniformLocation(this.renderProgram, "u_scaleMode"),
			shapeScale: gl.getUniformLocation(this.renderProgram, "u_shapeScale"),
			gradientTexture: gl.getUniformLocation(this.renderProgram, "u_gradientTexture"),
			scaleTexture: gl.getUniformLocation(this.renderProgram, "u_scaleTexture"),
			...(useImage ? { particleTexture: gl.getUniformLocation(this.renderProgram, "u_particleTexture") } : {})
		};
	}

	createProgram(vsSource, fsSource) {
		const gl = this.gl;
		const vs = this.compileShader(gl.VERTEX_SHADER, vsSource);
		const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSource);

		const program = gl.createProgram();
		gl.attachShader(program, vs);
		gl.attachShader(program, fs);
		gl.linkProgram(program);

		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			if (debugging) console.error("Program link error:", gl.getProgramInfoLog(program));
			gl.deleteProgram(program);
			return null;
		}

		return program;
	}

	compileShader(type, source) {
		const gl = this.gl;
		const shader = gl.createShader(type);
		gl.shaderSource(shader, source);
		gl.compileShader(shader);

		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			if (debugging) console.error("Shader compile error:", gl.getShaderInfoLog(shader));
			gl.deleteShader(shader);
			return null;
		}

		return shader;
	}

	initParticles() {
		const gl = this.gl;
		const max = this.config.maxParticles;

		// CPU tracks Physics: x, y, vx, vy, age, life, phase
		this.cpuData = new Float32Array(max * 7);
		// GPU gets layout: x, y, normalizedAge, baseScale
		this.gpuData = new Float32Array(max * 4);

		for (let i = 0; i < max; i++) {
			this.cpuData[i * 7 + 4] = 9999; // Force instant spawn
			this.cpuData[i * 7 + 5] = 1;
			this.cpuData[i * 7 + 6] = Math.random() * Math.PI * 2;
		}

		this.buffer = gl.createBuffer();
		this.vao = gl.createVertexArray();

		gl.bindVertexArray(this.vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
		gl.bufferData(gl.ARRAY_BUFFER, this.gpuData.byteLength, gl.DYNAMIC_DRAW);

		const stride = 4 * 4;
		gl.enableVertexAttribArray(0); // Pos
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);

		gl.enableVertexAttribArray(1); // Normalized Age & Base Scale
		gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 2 * 4);

		gl.bindVertexArray(null);

		this.activeParticles = 0;
	}

	render(now) {
		const gl = this.gl;

		if (this.config.fpsLimit > 0) {
			const targetDt = 1.0 / this.config.fpsLimit;
			if ((now - this.lastTime) / 1000.0 < targetDt - 0.001) {
				this.animationFrameId = requestAnimationFrame(this.render);
				return;
			}
		}

		const dt = Math.min((now - this.lastTime) / 1000.0, 0.1);
		this.lastTime = now;

		if (this.emitting && (this.config.interactionType !== "follow" || this.pointer.active)) {
			this.spawnRemainder += this.config.emissionRate * dt;
		}

		const count = Math.floor(this.activeParticles);
		if (count < 0) {
			this.animationFrameId = requestAnimationFrame(this.render);
			return;
		}

		const cpu = this.cpuData;
		const gpu = this.gpuData;
		const follow = this.config.interactionType === "follow" && this.pointer.active;
		const ex = follow ? this.pointer.normalizedX * this.canvas.width : this.config.emitterPosition.x * this.canvas.width;
		const ey = follow ? this.pointer.normalizedY * this.canvas.height : this.config.emitterPosition.y * this.canvas.height;
		const ew = this.config.emitterSize.x * this.canvas.width;
		const eh = this.config.emitterSize.y * this.canvas.height;

		const eAngle = this.config.emitterAngle * this.degToRad;
		const eSpread = this.config.emitterSpread * this.degToRad;
		const bSpeed = this.config.particleSpeed;
		const bLife = this.config.particleLife;

		const px = this.pointer.normalizedX * this.canvas.width;
		const py = this.pointer.normalizedY * this.canvas.height;
		const repel = this.config.interactionType === "repel" && this.pointer.active;
		const rRadius = this.config.repelRadius;
		const rStrength = this.config.repelStrength;
		const gravX = this.config.gravity.x;
		const gravY = this.config.gravity.y;

		const swayType = this.config.swayType;
		const swayAmount = this.config.swayAmount;
		const swayFreq = this.config.swayFrequency;

		const sRandom = this.config.scaleRandom || { min: 50, max: 100 };
		const sMin = sRandom.min / 100.0;
		const sMax = sRandom.max / 100.0;
		const isVariableScale = this.config.scaleMode === "variable";

		for (let i = 0; i < count; i++) {
			let i7 = i * 7;
			let i4 = i * 4;

			let age = cpu[i7 + 4] + dt;
			let life = cpu[i7 + 5];

			if (age < life) {
				if (repel) {
					let dx = cpu[i7] - px;
					let dy = cpu[i7 + 1] - py;
					let distSq = dx * dx + dy * dy;
					if (distSq < rRadius * rRadius && distSq > 0) {
						let dist = Math.sqrt(distSq);
						let force = (1.0 - dist / rRadius) * rStrength * dt;
						cpu[i7 + 2] += (dx / dist) * force;
						cpu[i7 + 3] += (dy / dist) * force;
					}
				}

				cpu[i7 + 2] += gravX * dt;
				cpu[i7 + 3] += gravY * dt;

				cpu[i7] += cpu[i7 + 2] * dt;
				cpu[i7 + 1] += cpu[i7 + 3] * dt;
			} else if (this.spawnRemainder >= 1.0) {
				this.spawnRemainder -= 1.0;
				cpu[i7] = ex + (Math.random() - 0.5) * ew;
				cpu[i7 + 1] = ey + (Math.random() - 0.5) * eh;

				let angle = eAngle + (Math.random() - 0.5) * eSpread;
				let speed = bSpeed + Math.random() * bSpeed * 0.5;

				cpu[i7 + 2] = Math.cos(angle) * speed;
				cpu[i7 + 3] = Math.sin(angle) * speed;

				age = 0.0;
				life = bLife + Math.random() * bLife * 0.5;
				cpu[i7 + 5] = life;
				cpu[i7 + 6] = Math.random() * Math.PI * 2;

				if (isVariableScale) {
					gpu[i4 + 3] = sMin + Math.random() * (sMax - sMin);
				} else {
					gpu[i4 + 3] = 1.0;
				}
			} else {
				age = life + 0.1;
			}

			cpu[i7 + 4] = age;

			let sx = 0, sy = 0;
			if (swayAmount > 0) {
				const phase = cpu[i7 + 6];
				const t = age * swayFreq + phase;
				if (swayType === "sine") {
					sx = Math.sin(t) * swayAmount;
				} else if (swayType === "zigzag") {
					sx = (Math.abs((t / Math.PI % 2) - 1) * 2 - 1) * swayAmount;
				} else if (swayType === "circular") {
					sx = Math.sin(t) * swayAmount;
					sy = Math.cos(t) * swayAmount;
				}
			}

			gpu[i4] = cpu[i7] + sx;
			gpu[i4 + 1] = cpu[i7 + 1] + sy;
			gpu[i4 + 2] = age / life;
		}

		while (this.spawnRemainder >= 1.0 && this.activeParticles < this.config.maxParticles) {
			this.spawnRemainder -= 1.0;
			let i = Math.floor(this.activeParticles);
			let i7 = i * 7;
			let i4 = i * 4;

			cpu[i7] = ex + (Math.random() - 0.5) * ew;
			cpu[i7 + 1] = ey + (Math.random() - 0.5) * eh;

			let angle = eAngle + (Math.random() - 0.5) * eSpread;
			let speed = bSpeed + Math.random() * bSpeed * 0.5;

			cpu[i7 + 2] = Math.cos(angle) * speed;
			cpu[i7 + 3] = Math.sin(angle) * speed;

			cpu[i7 + 4] = 0.0;
			let life = bLife + Math.random() * bLife * 0.5;
			cpu[i7 + 5] = life;
			cpu[i7 + 6] = Math.random() * Math.PI * 2;

			gpu[i4] = cpu[i7];
			gpu[i4 + 1] = cpu[i7 + 1];
			gpu[i4 + 2] = 0.0;
			gpu[i4 + 3] = isVariableScale ? (sMin + Math.random() * (sMax - sMin)) : 1.0;

			this.activeParticles++;
		}

		gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, gpu, 0, Math.floor(this.activeParticles) * 4);

		gl.viewport(0, 0, this.canvas.width, this.canvas.height);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);

		const actualW = this.config.particleDimensions.x;
		const actualH = this.config.particleDimensions.y;
		const maxDim = Math.max(actualW, actualH, 0.001);

		gl.useProgram(this.renderProgram);
		gl.uniform2f(this.uniforms.render.rcpResolution, 2.0 / this.canvas.width, 2.0 / this.canvas.height);
		gl.uniform1f(this.uniforms.render.size, maxDim);
		gl.uniform1f(this.uniforms.render.scaleMode, isVariableScale ? 1.0 : 0.0);
		gl.uniform2f(this.uniforms.render.shapeScale, actualW / maxDim, actualH / maxDim);

		if (this.gradientTexture) {
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, this.gradientTexture);
			gl.uniform1i(this.uniforms.render.gradientTexture, 0);
		}

		if (this.scaleTexture) {
			gl.activeTexture(gl.TEXTURE2);
			gl.bindTexture(gl.TEXTURE_2D, this.scaleTexture);
			gl.uniform1i(this.uniforms.render.scaleTexture, 2);
		}

		if (this.config.particleShape === "image" && this.particleTexture) {
			gl.activeTexture(gl.TEXTURE1);
			gl.bindTexture(gl.TEXTURE_2D, this.particleTexture);
			gl.uniform1i(this.uniforms.render.particleTexture, 1);
		}

		gl.bindVertexArray(this.vao);
		gl.drawArrays(gl.POINTS, 0, Math.floor(this.activeParticles));

		this.animationFrameId = requestAnimationFrame(this.render);
	}

	destroy() {
		cancelAnimationFrame(this.animationFrameId);
		this.canvas.removeEventListener("pointermove", this.handlePointerMove);
		this.canvas.removeEventListener("pointerdown", this.handlePointerMove);
		this.canvas.removeEventListener("pointerleave", this.handlePointerLeave);
		this.canvas.removeEventListener("pointerup", this.handlePointerLeave);
		this.canvas.removeEventListener("pointercancel", this.handlePointerLeave);
		const gl = this.gl;
		gl.deleteProgram(this.renderProgram);
		gl.deleteBuffer(this.buffer);
		gl.deleteVertexArray(this.vao);
		if (this.gradientTexture) gl.deleteTexture(this.gradientTexture);
		if (this.scaleTexture) gl.deleteTexture(this.scaleTexture);
		if (this.particleTexture) gl.deleteTexture(this.particleTexture);
	}
}

export { WebGLitter };
export default WebGLitter;