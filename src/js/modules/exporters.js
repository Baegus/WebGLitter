import { triggerDownload } from "./utils";

const mapColorToLibrary = (points) => points.map(p => ({
	time: p.time,
	value: Array.isArray(p.value) ? [...p.value] : [p.value.r, p.value.g, p.value.b, p.value.a]
}));

const mapColorToUI = (points) => points.map(p => ({
	time: p.time,
	value: Array.isArray(p.value) ? { r: p.value[0], g: p.value[1], b: p.value[2], a: p.value[3] } : { ...p.value }
}));

export const uiToLibrary = (uiParams) => {
	const config = JSON.parse(JSON.stringify(uiParams.particleSystem, (key, value) => {
		if (value instanceof File) return "[File Object]";
		return value;
	}));

	// Position: UI (-1..1) -> Library (0..1)
	if (config.emitterPosition) {
		config.emitterPosition.x = (config.emitterPosition.x + 1) / 2;
		config.emitterPosition.y = (config.emitterPosition.y + 1) / 2;
	}

	// Remove editor-only properties
	delete config.emitterDirection;

	// Gradients: UI Points -> Array Colors
	if (config.colorGradient) config.colorGradient = mapColorToLibrary(config.colorGradient);
	if (config.opacityGradient) config.opacityGradient = mapColorToLibrary(config.opacityGradient);
	if (config.scaleGradient) config.scaleGradient = mapColorToLibrary(config.scaleGradient);

	return config;
}

export const libraryToUI = (libConfig) => {
	const params = JSON.parse(JSON.stringify(libConfig));

	// Position: Library (0..1) -> UI (-1..1)
	if (params.emitterPosition) {
		params.emitterPosition.x = (params.emitterPosition.x * 2) - 1;
		params.emitterPosition.y = (params.emitterPosition.y * 2) - 1;
	}

	// Gradients: Array Colors -> UI Points
	if (params.colorGradient) params.colorGradient = mapColorToUI(params.colorGradient);
	if (params.opacityGradient) params.opacityGradient = mapColorToUI(params.opacityGradient);
	if (params.scaleGradient) params.scaleGradient = mapColorToUI(params.scaleGradient);

	return params;
}

export const exportHTML = (PARAMS) => {
	const config = uiToLibrary(PARAMS);
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
		particleSystem: uiToLibrary(PARAMS),
	};
	const json = JSON.stringify(data, null, "\t");
	triggerDownload("webglitter-config.json", json, "application/json");
}
