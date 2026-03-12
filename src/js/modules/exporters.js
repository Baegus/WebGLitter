import { triggerDownload } from "./utils";

const mapColorToLibrary = (points) => points.map(p => ({
	time: p.time,
	value: Array.isArray(p.value) ? [...p.value] : [p.value.r, p.value.g, p.value.b, p.value.a]
}));

const mapColorToUI = (points) => points.map(p => ({
	time: p.time,
	value: Array.isArray(p.value) ? { r: p.value[0], g: p.value[1], b: p.value[2], a: p.value[3] } : { ...p.value }
}));

const formatJSON = (obj) => {
	const replacer = (key, value) => {
		if (typeof value === "number") {
			return Number(value.toFixed(2));
		}
		return value;
	};

	// Make sure colors are in a single line
	let output = JSON.stringify(obj, replacer, "\t").replace(
		/\[[\s\d.,-]+\]/g,
		(match) => match.replace(/\s+/g, " ").replace(/\[ /g, "[").replace(/ \]/g, "]")
	);

	// Make sure gradient stops are in a single line
	output = output.replace(
		/\{\s*"time":\s*([0-9.]+),\s*"value":\s*(\[[^\]]+\])\s*\}/g,
		'{ "time": $1, "value": $2 }'
	);

	return output;
};

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
			font-family: system-ui, sans-serif;
			display: flex;
			flex-direction: column;
			align-items: center;
			min-height: 100vh;
			gap: 16px;
			padding: 20px;
		}
		canvas {
			display: block;
			max-width: 100%;
			background: #000000ff;
		}
	</style>
</head>
<body>

<canvas id="particleCanvas"></canvas>

<div class="controls">
	<button id="btnPause">Pause</button>
	<button id="btnEmit">Stop emitting</button>
	<button id="btnRestart">Restart</button>
	<button id="btnDestroy">Destroy</button>
	<label>Emission rate
		<input id="rateSlider" type="range" min="1" max="10000" step="10" value="${config.emissionRate}">
	</label>
	<label>Speed
		<input id="speedSlider" type="range" min="0" max="1000" step="5" value="${config.particleSpeed}">
	</label>
</div>

<script type="module">
import WebGLitter from "./WebGLitter.js";

// ---------------------------------------------------------------------------
// Config — edit any property here before or after instantiation
// ---------------------------------------------------------------------------
const config =
${formatJSON(config)}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
const canvas = document.getElementById("particleCanvas");
canvas.width = ${canvasSize.x};
canvas.height = ${canvasSize.y};

let particles = new WebGLitter(canvas, config);

// ---------------------------------------------------------------------------
// Control examples
// ---------------------------------------------------------------------------

// Pause / Resume — freezes the entire animation loop
btnPause.addEventListener("click", () => {
	if (particles.paused) {
		particles.resume();
		btnPause.textContent = "Pause";
		btnPause.classList.remove("active");
	} else {
		particles.pause();
		btnPause.textContent = "Resume";
		btnPause.classList.add("active");
	}
});

// Stop / Start emitting — lets live particles finish but no new ones spawn
btnEmit.addEventListener("click", () => {
	if (particles.emitting) {
		particles.stopEmitting();
		btnEmit.textContent = "Start emitting";
		btnEmit.classList.add("active");
	} else {
		particles.startEmitting();
		btnEmit.textContent = "Stop emitting";
		btnEmit.classList.remove("active");
	}
});

// Restart — kills all current particles and starts fresh
btnRestart.addEventListener("click", () => {
	particles.restart();
});

// Destroy + re‑create — full teardown and re‑init
btnDestroy.addEventListener("click", () => {
	if (btnDestroy.textContent === "Destroy") {
		particles.destroy();
		particles = null;
		btnDestroy.textContent = "Re-create";
		btnDestroy.classList.add("active");
		btnPause.disabled = btnEmit.disabled = true;
	} else {
		particles = new WebGLitter(canvas, config);
		btnDestroy.textContent = "Destroy";
		btnDestroy.classList.remove("active");
		btnPause.disabled = btnEmit.disabled = false;
	}
});

// Live config update — change any property at any time via updateConfig()
rateSlider.addEventListener("input", () => {
	const val = Number(rateSlider.value);
	if (particles) particles.updateConfig({ emissionRate: val });
});

speedSlider.addEventListener("input", () => {
	const val = Number(speedSlider.value);
	if (particles) particles.updateConfig({ particleSpeed: val });
});
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
	const json = formatJSON(data);
	triggerDownload("webglitter-config.json", json, "application/json");
}
