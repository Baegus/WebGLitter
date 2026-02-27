const debugging = process.env.DEBUG == "true";

export default class WebGLitter {
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
			fpsLimit: 60,
			emitterPosition: { x: 0.5, y: 0.5 },
			emitterSize: { x: 0, y: 0 },
			emitterAngle: 0,
			emitterSpread: 360,
			particleShape: "circle",
			particleImage: null,
			colorGradient: null,
			opacityGradient: null,
			...config
		};

		this.lastTime = performance.now();
		
		this.initWebGL();
		this.initParticles();

		if (this.config.colorGradient || this.config.opacityGradient) {
			this.updateGradientTexture();
		}
		if (this.config.particleImage) {
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
		}
		if (newConfig.colorGradient !== undefined || newConfig.opacityGradient !== undefined) {
			this.updateGradientTexture();
		}
		if (newConfig.particleImage !== undefined) {
			this.updateParticleImage();
		}
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
			for (const p of points) gradC.addColorStop(p.time, `rgba(${p.value.r}, ${p.value.g}, ${p.value.b}, ${p.value.a})`);
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
			for (const p of points) gradO.addColorStop(p.time, `rgba(255, 255, 255, ${p.value.a})`);
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

	updateParticleImage() {
		const gl = this.gl;
		if (!this.config.particleImage) {
			if (this.particleTexture) {
				gl.deleteTexture(this.particleTexture);
				this.particleTexture = null;
			}
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
		precision lowp float;

		layout(location = 0) in vec2 a_position;
		layout(location = 1) in float a_normalizedAge;

		uniform vec2 u_resolution;
		uniform float u_size;
		uniform sampler2D u_gradientTexture;

		out vec4 v_color;

		void main() {
			vec2 clipSpace = (a_position / u_resolution) * 2.0 - 1.0;
			clipSpace.y = -clipSpace.y;
			
			gl_Position = vec4(clipSpace, 0.0, 1.0);
			gl_PointSize = u_size;
			
			v_color = texture(u_gradientTexture, vec2(a_normalizedAge, 0.5));
		}
		`;

		this.initRenderProgram();

		// Set permanent gl state optimizations
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
	}

	initRenderProgram() {
		const gl = this.gl;
		if (this.renderProgram) gl.deleteProgram(this.renderProgram);

		const useCircle = this.config.particleShape === "circle";
		const useImage = this.config.particleShape === "image";

		const renderFsSource = `#version 300 es
		precision lowp float;

		in vec4 v_color;
		out vec4 outColor;

		${useImage ? 'uniform sampler2D u_particleTexture;' : ''}

		void main() {
			${useCircle ? `
			vec2 coord = gl_PointCoord - vec2(0.5);
			if (dot(coord, coord) > 0.25) discard;
			` : ''}
			
			vec4 color = v_color;
			
			${useImage ? `
			vec2 texCoord = vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y);
			color *= texture(u_particleTexture, texCoord);
			` : ''}
			
			outColor = vec4(color.rgb * color.a, color.a);
		}
		`;

		this.renderProgram = this.createProgram(this.renderVsSource, renderFsSource);

		this.uniforms.render = {
			resolution: gl.getUniformLocation(this.renderProgram, "u_resolution"),
			size: gl.getUniformLocation(this.renderProgram, "u_size"),
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

		// CPU tracks Physics: x, y, vx, vy, age, life
		this.cpuData = new Float32Array(max * 6);
		// GPU only gets layout: x, y, normalizedAge
		this.gpuData = new Float32Array(max * 3);

		for (let i = 0; i < max; i++) {
			this.cpuData[i * 6 + 4] = 9999; // Force instant spawn
			this.cpuData[i * 6 + 5] = 1;
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
		
		// Calculate delta time
		let dt = (now - this.lastTime) / 1000.0;
		
		if (this.config.fpsLimit > 0) {
			const targetDt = 1.0 / this.config.fpsLimit;
			if (dt < targetDt) {
				this.animationFrameId = requestAnimationFrame(this.render);
				return;
			}
			if (dt > 0.1) dt = 0.1;
			this.lastTime = now - ((dt % targetDt) * 1000.0);
		} else {
			if (dt > 0.1) dt = 0.1;
			this.lastTime = now;
		}

		const targetParticles = Math.min(this.config.emissionRate * this.config.particleLife, this.config.maxParticles);

		if (this.activeParticles < targetParticles) {
			this.activeParticles += this.config.emissionRate * dt;
			if (this.activeParticles > targetParticles) this.activeParticles = targetParticles;
		} else if (this.activeParticles > targetParticles) {
			this.activeParticles = targetParticles;
		}

		const count = Math.floor(this.activeParticles);

		if (count > 0) {
			// CPU Optimizations: Pre-calc maths to keep loop entirely raw arithmetic
			const cpu = this.cpuData;
			const gpu = this.gpuData;
			const ex = this.config.emitterPosition.x * this.canvas.width;
			const ey = this.config.emitterPosition.y * this.canvas.height;
			const ew = this.config.emitterSize.x * this.canvas.width;
			const eh = this.config.emitterSize.y * this.canvas.height;
			const eAngle = this.config.emitterAngle * (Math.PI / 180.0);
			const eSpread = this.config.emitterSpread * (Math.PI / 180.0);
			const bSpeed = this.config.particleSpeed;
			const bLife = this.config.particleLife;

			// Blisteringly fast typed array JS calculation loop
			for (let i = 0; i < count; i++) {
				let i6 = i * 6;
				let i3 = i * 3;

				let age = cpu[i6 + 4] + dt;
				let life = cpu[i6 + 5];

				if (age >= life) {
					cpu[i6] = ex + (Math.random() - 0.5) * ew;
					cpu[i6 + 1] = ey + (Math.random() - 0.5) * eh;

					let angle = eAngle + (Math.random() - 0.5) * eSpread;
					let speed = bSpeed + Math.random() * bSpeed * 0.5;

					cpu[i6 + 2] = Math.cos(angle) * speed;
					cpu[i6 + 3] = Math.sin(angle) * speed;

					age = 0.0;
					life = bLife + Math.random() * bLife * 0.5;
					cpu[i6 + 5] = life;
				} else {
					cpu[i6] += cpu[i6 + 2] * dt;
					cpu[i6 + 1] += cpu[i6 + 3] * dt;
				}
				cpu[i6 + 4] = age;

				gpu[i3] = cpu[i6];
				gpu[i3 + 1] = cpu[i6 + 1];
				gpu[i3 + 2] = age / life;
			}

			// Subload exact bytes. (If 1 particle, this pushes 12 bytes instead of the full buffer)
			gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
			gl.bufferSubData(gl.ARRAY_BUFFER, 0, gpu, 0, count * 3);

			gl.viewport(0, 0, this.canvas.width, this.canvas.height);
			gl.clearColor(0, 0, 0, 0);
			gl.clear(gl.COLOR_BUFFER_BIT);

			gl.useProgram(this.renderProgram);
			gl.uniform2f(this.uniforms.render.resolution, this.canvas.width, this.canvas.height);
			gl.uniform1f(this.uniforms.render.size, this.config.particleSize);

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
			gl.drawArrays(gl.POINTS, 0, count);
		}

		this.animationFrameId = requestAnimationFrame(this.render);
	}

	destroy() {
		cancelAnimationFrame(this.animationFrameId);
		const gl = this.gl;
		gl.deleteProgram(this.renderProgram);
		gl.deleteBuffer(this.buffer);
		gl.deleteVertexArray(this.vao);
		if (this.gradientTexture) gl.deleteTexture(this.gradientTexture);
		if (this.particleTexture) gl.deleteTexture(this.particleTexture);
	}
}