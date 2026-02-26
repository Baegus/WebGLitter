const debugging = process.env.DEBUG == "true";

export default class WebGLitter {
	constructor(canvas, config = {}) {
		this.canvas = canvas;
		this.gl = canvas.getContext("webgl2", { antialias: false, alpha: true, premultipliedAlpha: false });
		
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
		
		if (this.config.colorGradient) {
			this.updateGradientTexture();
		}
		if (this.config.opacityGradient) {
			this.updateOpacityGradientTexture();
		}
		if (this.config.particleImage) {
			this.updateParticleImage();
		}
		
		this.render = this.render.bind(this);
		this.animationFrameId = requestAnimationFrame(this.render);
	}

	updateConfig(newConfig) {
		this.config = { ...this.config, ...newConfig };
		if (newConfig.colorGradient) {
			this.updateGradientTexture();
		}
		if (newConfig.opacityGradient) {
			this.updateOpacityGradientTexture();
		}
		if (newConfig.particleImage !== undefined) {
			this.updateParticleImage();
		}
	}

	updateGradientTexture() {
		if (!this.config.colorGradient) return;
		
		const gl = this.gl;
		const width = 256;
		
		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = 1;
		const ctx = canvas.getContext("2d");
		
		const gradient = ctx.createLinearGradient(0, 0, width, 0);
		
		const points = [...this.config.colorGradient].sort((a, b) => a.time - b.time);
		
		for (const point of points) {
			const color = `rgba(${point.value.r}, ${point.value.g}, ${point.value.b}, ${point.value.a})`;
			gradient.addColorStop(point.time, color);
		}
		
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, width, 1);
		
		const imageData = ctx.getImageData(0, 0, width, 1);
		
		if (!this.gradientTexture) {
			this.gradientTexture = gl.createTexture();
		}
		
		gl.bindTexture(gl.TEXTURE_2D, this.gradientTexture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, imageData.data);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	}

	updateOpacityGradientTexture() {
		if (!this.config.opacityGradient) return;
		
		const gl = this.gl;
		const width = 256;
		
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = 1;
		const ctx = canvas.getContext('2d');
		
		const gradient = ctx.createLinearGradient(0, 0, width, 0);
		
		const points = [...this.config.opacityGradient].sort((a, b) => a.time - b.time);
		
		for (const point of points) {
			const color = `rgba(${point.value.r}, ${point.value.g}, ${point.value.b}, 1.0)`;
			gradient.addColorStop(point.time, color);
		}
		
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, width, 1);
		
		const imageData = ctx.getImageData(0, 0, width, 1);
		
		if (!this.opacityTexture) {
			this.opacityTexture = gl.createTexture();
		}
		
		gl.bindTexture(gl.TEXTURE_2D, this.opacityTexture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, imageData.data);
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
			if (!this.particleTexture) {
				this.particleTexture = gl.createTexture();
			}
			gl.bindTexture(gl.TEXTURE_2D, this.particleTexture);
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

		// Update Shader
		const updateVsSource = `#version 300 es
		precision lowp float;

		layout(location = 0) in vec2 a_position;
		layout(location = 1) in vec2 a_velocity;
		layout(location = 2) in float a_age;
		layout(location = 3) in float a_life;

		out vec2 v_position;
		out vec2 v_velocity;
		out float v_age;
		out float v_life;

		uniform float u_deltaTime;
		uniform vec2 u_resolution;
		uniform float u_seed;
		uniform float u_speed;
		uniform float u_life;
		uniform vec2 u_emitterPosition;
		uniform float u_emitterAngle;
		uniform float u_emitterSpread;

		// Pseudo-random number generator
		float rand(vec2 co){
			return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
		}

		void main() {
			float newAge = a_age + u_deltaTime;
			
			if (newAge >= a_life) {
				// Respawn particle
				float r1 = rand(vec2(float(gl_VertexID), u_seed));
				float r2 = rand(vec2(float(gl_VertexID), u_seed + 1.0));
				
				// Emitter position
				v_position = u_emitterPosition * u_resolution;
				
				// Random velocity direction
				float spreadRad = radians(u_emitterSpread);
				float angleRad = radians(u_emitterAngle);
				float angle = angleRad + (r1 - 0.5) * spreadRad;
				float speed = u_speed + r2 * (u_speed * 0.5); // Base speed + random
				v_velocity = vec2(cos(angle), sin(angle)) * speed;
				
				v_age = 0.0;
				v_life = u_life + rand(vec2(float(gl_VertexID), u_seed + 2.0)) * (u_life * 0.5); // Random life
			} else {
				// Update particle
				v_position = a_position + a_velocity * u_deltaTime;
				v_velocity = a_velocity;
				v_age = newAge;
				v_life = a_life;
			}
		}
		`;

		const updateFsSource = `#version 300 es
		precision lowp float;
		void main() {
			discard;
		}
		`;

		// Render Shader
		const renderVsSource = `#version 300 es
		precision lowp float;

		layout(location = 0) in vec2 a_position;
		layout(location = 1) in vec2 a_velocity;
		layout(location = 2) in float a_age;
		layout(location = 3) in float a_life;

		uniform vec2 u_resolution;
		uniform float u_size;

		out float v_normalizedAge;

		void main() {
			// Convert pixel coordinates to clip space (-1 to 1)
			vec2 clipSpace = (a_position / u_resolution) * 2.0 - 1.0;
			// Flip Y axis
			clipSpace.y = -clipSpace.y;
			
			gl_Position = vec4(clipSpace, 0.0, 1.0);
			gl_PointSize = u_size; // Particle size
			
			v_normalizedAge = a_age / a_life;
		}
		`;

		const renderFsSource = `#version 300 es
		precision lowp float;

		in float v_normalizedAge;
		out vec4 outColor;

		uniform sampler2D u_gradientTexture;
		uniform sampler2D u_opacityTexture;
		uniform sampler2D u_particleTexture;
		uniform int u_shape; // 0: circle, 1: square, 2: image

		void main() {
			vec2 coord = gl_PointCoord - vec2(0.5);
			
			if (u_shape == 0) {
				// Circle
				if (length(coord) > 0.5) {
					discard;
				}
			} else if (u_shape == 1) {
				// Square - do nothing, keep full point
			}
			
			// Sample gradient
			vec4 color = texture(u_gradientTexture, vec2(v_normalizedAge, 0.5));
			vec4 opacityColor = texture(u_opacityTexture, vec2(v_normalizedAge, 0.5));
			color.a *= opacityColor.r;
			
			if (u_shape == 2) {
				// Image
				vec2 texCoord = vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y);
				vec4 texColor = texture(u_particleTexture, texCoord);
				color *= texColor;
			}
			
			outColor = color;
		}
		`;

		this.updateProgram = this.createProgram(updateVsSource, updateFsSource, ["v_position", "v_velocity", "v_age", "v_life"]);
		this.renderProgram = this.createProgram(renderVsSource, renderFsSource);

		this.uniforms = {
			update: {
				deltaTime: gl.getUniformLocation(this.updateProgram, "u_deltaTime"),
				resolution: gl.getUniformLocation(this.updateProgram, "u_resolution"),
				seed: gl.getUniformLocation(this.updateProgram, "u_seed"),
				speed: gl.getUniformLocation(this.updateProgram, "u_speed"),
				life: gl.getUniformLocation(this.updateProgram, "u_life"),
				emitterPosition: gl.getUniformLocation(this.updateProgram, "u_emitterPosition"),
				emitterAngle: gl.getUniformLocation(this.updateProgram, "u_emitterAngle"),
				emitterSpread: gl.getUniformLocation(this.updateProgram, "u_emitterSpread")
			},
			render: {
				resolution: gl.getUniformLocation(this.renderProgram, "u_resolution"),
				size: gl.getUniformLocation(this.renderProgram, "u_size"),
				gradientTexture: gl.getUniformLocation(this.renderProgram, "u_gradientTexture"),
				opacityTexture: gl.getUniformLocation(this.renderProgram, "u_opacityTexture"),
				particleTexture: gl.getUniformLocation(this.renderProgram, "u_particleTexture"),
				shape: gl.getUniformLocation(this.renderProgram, "u_shape")
			}
		};
	}

	createProgram(vsSource, fsSource, transformFeedbackVaryings = null) {
		const gl = this.gl;
		const vs = this.compileShader(gl.VERTEX_SHADER, vsSource);
		const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSource);

		const program = gl.createProgram();
		gl.attachShader(program, vs);
		gl.attachShader(program, fs);

		if (transformFeedbackVaryings) {
			gl.transformFeedbackVaryings(program, transformFeedbackVaryings, gl.INTERLEAVED_ATTRIBS);
		}

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
		const maxParticles = this.config.maxParticles;

		// Particle data: position (2), velocity (2), age (1), life (1) = 6 floats per particle
		const particleData = new Float32Array(maxParticles * 6);
		
		// Initialize all particles as "dead" (age > life) so they spawn over time
		for (let i = 0; i < maxParticles; i++) {
			particleData[i * 6 + 0] = 0; // x
			particleData[i * 6 + 1] = 0; // y
			particleData[i * 6 + 2] = 0; // vx
			particleData[i * 6 + 3] = 0; // vy
			particleData[i * 6 + 4] = 9999; // age
			particleData[i * 6 + 5] = 1; // life
		}

		this.buffers = [gl.createBuffer(), gl.createBuffer()];
		this.vaos = [gl.createVertexArray(), gl.createVertexArray()];
		this.transformFeedbacks = [gl.createTransformFeedback(), gl.createTransformFeedback()];

		for (let i = 0; i < 2; i++) {
			gl.bindVertexArray(this.vaos[i]);
			
			gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[i]);
			gl.bufferData(gl.ARRAY_BUFFER, particleData, gl.DYNAMIC_DRAW);

			const stride = 6 * 4; // 6 floats, 4 bytes each
			
			// Position
			gl.enableVertexAttribArray(0);
			gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
			
			// Velocity
			gl.enableVertexAttribArray(1);
			gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 2 * 4);
			
			// Age
			gl.enableVertexAttribArray(2);
			gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 4 * 4);
			
			// Life
			gl.enableVertexAttribArray(3);
			gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 5 * 4);

			gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.transformFeedbacks[i]);
			gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, this.buffers[i]);
		}

		gl.bindVertexArray(null);
		gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
		gl.bindBuffer(gl.ARRAY_BUFFER, null);

		this.readIndex = 0;
		this.writeIndex = 1;
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
			
			if (dt > 0.1) {
				this.lastTime = now;
			} else {
				this.lastTime = now - ((dt % targetDt) * 1000.0);
			}
		} else {
			this.lastTime = now;
		}
		
		// Cap dt to avoid huge jumps if tab was inactive
		if (dt > 0.1) dt = 0.1;

		// The number of particles we should be simulating is based on emission rate and life
		const targetParticles = Math.min(this.config.emissionRate * this.config.particleLife, this.config.maxParticles);

		if (this.activeParticles < targetParticles) {
			this.activeParticles += this.config.emissionRate * dt;
			if (this.activeParticles > targetParticles) {
				this.activeParticles = targetParticles;
			}
		} else if (this.activeParticles > targetParticles) {
			// If we reduced emission rate, we can just shrink the active count
			// (some particles will disappear instantly, which is fine for a basic implementation)
			this.activeParticles = targetParticles;
		}

		const count = Math.floor(this.activeParticles);

		if (count > 0) {
			// 1. Update Pass (Transform Feedback)
			gl.useProgram(this.updateProgram);
			
			gl.uniform1f(this.uniforms.update.deltaTime, dt);
			gl.uniform2f(this.uniforms.update.resolution, this.canvas.width, this.canvas.height);
			gl.uniform1f(this.uniforms.update.seed, Math.random() * 100.0);
			gl.uniform1f(this.uniforms.update.speed, this.config.particleSpeed);
			gl.uniform1f(this.uniforms.update.life, this.config.particleLife);
			gl.uniform2f(this.uniforms.update.emitterPosition, this.config.emitterPosition.x, this.config.emitterPosition.y);
			gl.uniform1f(this.uniforms.update.emitterAngle, this.config.emitterAngle);
			gl.uniform1f(this.uniforms.update.emitterSpread, this.config.emitterSpread);

			gl.bindVertexArray(this.vaos[this.readIndex]);
			gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.transformFeedbacks[this.writeIndex]);
			
			// Disable rasterization during update
			gl.enable(gl.RASTERIZER_DISCARD);
			
			gl.beginTransformFeedback(gl.POINTS);
			gl.drawArrays(gl.POINTS, 0, count);
			gl.endTransformFeedback();
			
			gl.disable(gl.RASTERIZER_DISCARD);
			gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);

			// 2. Render Pass
			gl.viewport(0, 0, this.canvas.width, this.canvas.height);
			gl.clearColor(0, 0, 0, 0); // Transparent clear, canvas background handles color
			gl.clear(gl.COLOR_BUFFER_BIT);

			gl.enable(gl.BLEND);
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // Additive blending

			gl.useProgram(this.renderProgram);
			gl.uniform2f(this.uniforms.render.resolution, this.canvas.width, this.canvas.height);
			gl.uniform1f(this.uniforms.render.size, this.config.particleSize);

			let shapeInt = 0;
			if (this.config.particleShape === "square") shapeInt = 1;
			if (this.config.particleShape === "image") shapeInt = 2;
			gl.uniform1i(this.uniforms.render.shape, shapeInt);

			if (this.gradientTexture) {
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, this.gradientTexture);
				gl.uniform1i(this.uniforms.render.gradientTexture, 0);
			}

			if (this.opacityTexture) {
				gl.activeTexture(gl.TEXTURE1);
				gl.bindTexture(gl.TEXTURE_2D, this.opacityTexture);
				gl.uniform1i(this.uniforms.render.opacityTexture, 1);
			}

			if (this.particleTexture && shapeInt === 2) {
				gl.activeTexture(gl.TEXTURE2);
				gl.bindTexture(gl.TEXTURE_2D, this.particleTexture);
				gl.uniform1i(this.uniforms.render.particleTexture, 2);
			}

			gl.bindVertexArray(this.vaos[this.writeIndex]);
			gl.drawArrays(gl.POINTS, 0, count);

			gl.disable(gl.BLEND);

			// Swap buffers
			let temp = this.readIndex;
			this.readIndex = this.writeIndex;
			this.writeIndex = temp;
		}

		this.animationFrameId = requestAnimationFrame(this.render);
	}

	destroy() {
		cancelAnimationFrame(this.animationFrameId);
		// Cleanup WebGL resources
		const gl = this.gl;
		gl.deleteProgram(this.updateProgram);
		gl.deleteProgram(this.renderProgram);
		gl.deleteBuffer(this.buffers[0]);
		gl.deleteBuffer(this.buffers[1]);
		gl.deleteVertexArray(this.vaos[0]);
		gl.deleteVertexArray(this.vaos[1]);
		gl.deleteTransformFeedback(this.transformFeedbacks[0]);
		gl.deleteTransformFeedback(this.transformFeedbacks[1]);
	}
}
