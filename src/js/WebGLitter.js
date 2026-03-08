const debugging = process.env.DEBUG == "true";

class WebGLitter {
	constructor(canvas, config = {}) {
		this.canvas = canvas;
		this.gl = canvas.getContext("webgl2", { antialias: false, alpha: true });
		
		if (!this.gl) {
			throw new Error("WebGL 2 is not supported in this browser.");
		}

		this.config = {
			maxParticles: 100000,
			emissionRate: 5000, // particles per second
			particleLife: 2.0, // seconds
			particleSpeed: 100.0,
			particleSize: 10.0,
			particleDimensions: { x: 100, y: 100 },
			fpsLimit: 60,
			emitterPosition: { x: 0.5, y: 0.5 },
			emitterSize: { x: 0, y: 0 },
			emitterAngle: 0,
			emitterSpread: 360,
			particleShape: "softCircle",
			particleImage: null,
			colorGradient: null,
			opacityGradient: null,
			interactionType: "none",
			repelRadius: 100.0,
			repelStrength: 500.0,
			gravity: { x: 0, y: 0 },
			blendMode: "additive",
			swayType: "none",
			swayAmount: 0,
			swayFrequency: 1.0,
			...config
		};

		this.lastTime = performance.now();
		this.spawnRemainder = 0;

		this.degToRad = Math.PI / 180.0;


		this.pointer = { normalizedX: 0.5, normalizedY: 0.5, active: false };
		
		this.handlePointerMove = (e) => {
			const rect = this.canvas.getBoundingClientRect();
			this.pointer.normalizedX = (e.clientX - rect.left) / rect.width;
			this.pointer.normalizedY = (e.clientY - rect.top) / rect.height;
			this.pointer.active = true;
		};
		this.handlePointerLeave = () => {
			this.pointer.active = false;
		};
		
		this.canvas.addEventListener("pointermove", this.handlePointerMove);
		this.canvas.addEventListener("pointerdown", this.handlePointerMove);
		this.canvas.addEventListener("pointerleave", this.handlePointerLeave);
		this.canvas.addEventListener("pointerup", this.handlePointerLeave);
		this.canvas.addEventListener("pointercancel", this.handlePointerLeave);

		this.initWebGL();
		this.initParticles();

		if (this.config.colorGradient || this.config.opacityGradient) {
			this.updateGradientTexture();
		}
		if (this.config.particleImage || this.config.particleShape === "image") {
			this.updateParticleImage();
		}

		this.render = this.render.bind(this);
		this.animationFrameId = requestAnimationFrame(this.render);
	}

	updateConfig(newConfig) {
		const oldShape = this.config.particleShape;
		this.config = { ...this.config, ...newConfig };

		if (oldShape !== this.config.particleShape) {
			this.initRenderProgram();
			if (this.config.particleShape === "image") {
				this.updateParticleImage();
			}
		}
		if (newConfig.blendMode !== undefined) {
			this.applyBlendMode();
		}
		if (newConfig.colorGradient !== undefined || newConfig.opacityGradient !== undefined) {
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

		const canvasC = document.createElement("canvas");
		canvasC.width = width;
		canvasC.height = 1;
		const ctxC = canvasC.getContext("2d", { willReadFrequently: true });

		const gradC = ctxC.createLinearGradient(0, 0, width, 0);
		if (this.config.colorGradient && this.config.colorGradient.length > 0) {
			const points = [...this.config.colorGradient].sort((a, b) => a.time - b.time);
			for (const p of points) gradC.addColorStop(p.time, `rgba(${p.value[0]}, ${p.value[1]}, ${p.value[2]}, ${p.value[3]})`);
		} else {
			gradC.addColorStop(0, "rgba(255, 255, 255, 1)");
			gradC.addColorStop(1, "rgba(255, 255, 255, 1)");
		}
		ctxC.fillStyle = gradC;
		ctxC.fillRect(0, 0, width, 1);

		const canvasO = document.createElement("canvas");
		canvasO.width = width;
		canvasO.height = 1;
		const ctxO = canvasO.getContext("2d", { willReadFrequently: true });

		const gradO = ctxO.createLinearGradient(0, 0, width, 0);
		if (this.config.opacityGradient && this.config.opacityGradient.length > 0) {
			const points = [...this.config.opacityGradient].sort((a, b) => a.time - b.time);
			for (const p of points) gradO.addColorStop(p.time, `rgba(255, 255, 255, ${p.value[3]})`);
		} else {
			gradO.addColorStop(0, "rgba(255, 255, 255, 1)");
			gradO.addColorStop(1, "rgba(255, 255, 255, 1)");
		}
		ctxO.fillStyle = gradO;
		ctxO.clearRect(0, 0, width, 1);
		ctxO.fillRect(0, 0, width, 1);

		const dataC = ctxC.getImageData(0, 0, width, 1).data;
		const dataO = ctxO.getImageData(0, 0, width, 1).data;

		const finalData = new Uint8Array(width * 4);
		for (let i = 0; i < width; i++) {
			finalData[i * 4 + 0] = dataC[i * 4 + 0];
			finalData[i * 4 + 1] = dataC[i * 4 + 1];
			finalData[i * 4 + 2] = dataC[i * 4 + 2];
			finalData[i * 4 + 3] = Math.round((dataC[i * 4 + 3] * dataO[i * 4 + 3]) / 255.0);
		}

		if (!this.gradientTexture) this.gradientTexture = gl.createTexture();

		gl.bindTexture(gl.TEXTURE_2D, this.gradientTexture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, finalData);
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
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
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
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
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
		layout(location = 1) in float a_normalizedAge;

		uniform vec2 u_rcpResolution;
		uniform float u_size;
		uniform sampler2D u_gradientTexture;

		out lowp vec4 v_color;

		void main() {
			if (a_normalizedAge > 1.0) {
				gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
				return;
			}
			vec2 clipSpace = a_position * u_rcpResolution - 1.0;
			clipSpace.y = -clipSpace.y;
			
			gl_Position = vec4(clipSpace, 0.0, 1.0);
			gl_PointSize = u_size;
			
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
			
			outColor = vec4(color.rgb * color.a, color.a);
		}
		`;

		this.renderProgram = this.createProgram(this.renderVsSource, renderFsSource);

		this.uniforms.render = {
			rcpResolution: gl.getUniformLocation(this.renderProgram, "u_rcpResolution"),
			size: gl.getUniformLocation(this.renderProgram, "u_size"),
			shapeScale: gl.getUniformLocation(this.renderProgram, "u_shapeScale"),
			gradientTexture: gl.getUniformLocation(this.renderProgram, "u_gradientTexture"),
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
		// GPU only gets layout: x, y, normalizedAge
		this.gpuData = new Float32Array(max * 3);

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

		const stride = 3 * 4;
		gl.enableVertexAttribArray(0); // Pos
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);

		gl.enableVertexAttribArray(1); // Normalized Age
		gl.vertexAttribPointer(1, 1, gl.FLOAT, false, stride, 2 * 4);

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

		// Use real elapsed time so physics speed is independent of FPS limit / display rate
		const dt = Math.min((now - this.lastTime) / 1000.0, 0.1);
		this.lastTime = now;

		this.spawnRemainder += this.config.emissionRate * dt;
		
		const count = Math.floor(this.activeParticles);

		if (count >= 0) {
			// CPU Optimizations: Pre-calc maths to keep loop entirely raw arithmetic
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

			// Blisteringly fast typed array JS calculation loop
			for (let i = 0; i < count; i++) {
				let i7 = i * 7;
				let i3 = i * 3;

				let age = cpu[i7 + 4] + dt;
				let life = cpu[i7 + 5];

				if (age >= life) {
					if (this.spawnRemainder >= 1.0) {
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
					} else {
						// Keep it dead
						age = life + 0.1;
					}
				} else {
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

				gpu[i3] = cpu[i7] + sx;
				gpu[i3 + 1] = cpu[i7 + 1] + sy;
				gpu[i3 + 2] = age / life;
			}

			// Grow pool if we still have budget and haven't hit max
			while (this.spawnRemainder >= 1.0 && this.activeParticles < this.config.maxParticles) {
				this.spawnRemainder -= 1.0;
				let i = Math.floor(this.activeParticles);
				let i7 = i * 7;
				let i3 = i * 3;

				cpu[i7] = ex + (Math.random() - 0.5) * ew;
				cpu[i7 + 1] = ey + (Math.random() - 0.5) * eh;

				let angle = eAngle + (Math.random() - 0.5) * eSpread;
				let speed = bSpeed + Math.random() * bSpeed * 0.5;

				cpu[i7 + 2] = Math.cos(angle) * speed;
				cpu[i7 + 3] = Math.sin(angle) * speed;

				cpu[i7 + 4] = 0.0; // Age
				let life = bLife + Math.random() * bLife * 0.5;
				cpu[i7 + 5] = life;
				cpu[i7 + 6] = Math.random() * Math.PI * 2;

				gpu[i3] = cpu[i7];
				gpu[i3 + 1] = cpu[i7 + 1];
				gpu[i3 + 2] = 0.0;

				this.activeParticles++;
			}

			// Subload exact bytes. (If 1 particle, this pushes 12 bytes instead of the full buffer)
			gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
			gl.bufferSubData(gl.ARRAY_BUFFER, 0, gpu, 0, Math.floor(this.activeParticles) * 3);

			gl.viewport(0, 0, this.canvas.width, this.canvas.height);
			gl.clearColor(0, 0, 0, 0);
			gl.clear(gl.COLOR_BUFFER_BIT);

			const actualW = this.config.particleDimensions.x * (this.config.particleSize / 100.0);
			const actualH = this.config.particleDimensions.y * (this.config.particleSize / 100.0);
			const maxDim = Math.max(actualW, actualH, 0.001);

			gl.useProgram(this.renderProgram);
			gl.uniform2f(this.uniforms.render.rcpResolution, 2.0 / this.canvas.width, 2.0 / this.canvas.height);
			gl.uniform1f(this.uniforms.render.size, maxDim);
			gl.uniform2f(this.uniforms.render.shapeScale, actualW / maxDim, actualH / maxDim);

			if (this.gradientTexture) {
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, this.gradientTexture);
				gl.uniform1i(this.uniforms.render.gradientTexture, 0);
			}

			if (this.config.particleShape === "image" && this.particleTexture) {
				gl.activeTexture(gl.TEXTURE1);
				gl.bindTexture(gl.TEXTURE_2D, this.particleTexture);
				gl.uniform1i(this.uniforms.render.particleTexture, 1);
			}

			gl.bindVertexArray(this.vao);
			gl.drawArrays(gl.POINTS, 0, Math.floor(this.activeParticles));
		}

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
		if (this.particleTexture) gl.deleteTexture(this.particleTexture);
	}
}

export { WebGLitter };
export default WebGLitter;