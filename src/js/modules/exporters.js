import { triggerDownload } from "./utils";

export const getProcessedConfig = (PARAMS) => {
	// Deep clone the config
	const config = JSON.parse(JSON.stringify(PARAMS.particleSystem, (key, value) => {
		// Handle File objects which JSON.stringify would turn into {}
		if (value instanceof File) return "[File Object]";
		return value;
	}));

	// Convert UI emitter position (-1..1) to system position (0..1)
	config.emitterPosition = {
		x: (PARAMS.particleSystem.emitterPosition.x + 1) / 2,
		y: (PARAMS.particleSystem.emitterPosition.y + 1) / 2
	};

	// If it was a File object, it's currently unusable in exported JSON/HTML 
	// without base64 conversion. For now, we follow the "figure it out later" path.
	if (PARAMS.particleSystem.particleImage instanceof File) {
		config.particleImage = null; // Placeholder
	}

	return config;
}

export const exportHTML = (PARAMS) => {
	const config = getProcessedConfig(PARAMS);
	const canvasSize = PARAMS.canvas.size;
	const bgColor = PARAMS.canvas.backgroundColor;

	const html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>WebGLitter Particle System</title>
	<style>
		body { 
			margin: 0; 
			overflow: hidden; 
			display: flex; 
			justify-content: center; 
			align-items: center; 
			height: 100vh;
			font-family: sans-serif;
		}
		canvas { 
			display: block; 
			max-width: 100%; 
			max-height: 100%; 
			background: ${bgColor};
		}
	</style>
</head>
<body>

<canvas id="particle-canvas"></canvas>
<script type="module">
import WebGLitter from "./WebGLitter.js";
const config =
${JSON.stringify(config, null, "\t")}
const canvas = document.getElementById("particle-canvas");
canvas.width = ${canvasSize.x};
canvas.height = ${canvasSize.y};
const particles = new WebGLitter(canvas, config);
</script>

</body>
</html>`;
	triggerDownload("webglitter-preview.html", html, "text/html");
}

export const exportJSON = (PARAMS) => {
	const data = {
		canvas: PARAMS.canvas,
		particleSystem: getProcessedConfig(PARAMS),
	};
	const json = JSON.stringify(data, null, "\t");
	triggerDownload("webglitter-config.json", json, "application/json");
}