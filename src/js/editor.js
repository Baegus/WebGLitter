import { getID } from "./modules/utils.js";
import { Pane } from "tweakpane";
import { GradientPluginBundle } from "tweakpane-plugin-gradient";
import * as TweakpaneFileImportPlugin from "tweakpane-plugin-file-import";
import WebGLitter from "./WebGLitter.js";

const debugging = process.env.DEBUG == "true";

const PARAMS = {
	canvas: {
		width: 1280,
		height: 720,
		backgroundColor: "#000000ff",
	},
	particleSystem: {
		emissionRate: 5000,
		particleLife: 2.0,
		particleSpeed: 100.0,
		particleSize: 10.0,
		fpsLimit: 60,
		emitterPosition: { x: 0.5, y: 0.5 },
		emitterSize: { x: 0, y: 0 },
		emitterAngle: 0,
		emitterDirection: { x: 1, y: 0 },
		emitterSpread: 360,
		particleShape: "circle",
		particleImage: "",
		colorGradient: null, // Will be managed by the blade
		opacityGradient: null, // Will be managed by the blade
	},
};

const pane = new Pane({
	container: getID("controls"),
	title: "WebGLitter Editor",
});

pane.registerPlugin(GradientPluginBundle);
pane.registerPlugin(TweakpaneFileImportPlugin);

const canvasFolder = pane.addFolder({ title: "Canvas and Preview" });
const canvasWidth = canvasFolder.addBinding(PARAMS.canvas, "width", { min: 100, max: 2000, step: 1 });
const canvasHeight = canvasFolder.addBinding(PARAMS.canvas, "height", { min: 100, max: 2000, step: 1 });
const canvasBg = canvasFolder.addBinding(PARAMS.canvas, "backgroundColor", { view: "color", alpha: true });

// Zoom & Pan State (not exported)
const viewState = {
	zoom: 1,
	offset: { x: 0, y: 0 },
	autoFit: true,
};

const zoomBinding = canvasFolder.addBinding(viewState, "zoom", {
	min: 0.1,
	max: 5,
	step: 0.01,
	label: "Preview Zoom",
});

const particlesFolder = pane.addFolder({ title: "Particles" });

const presets = {
	"Default": { setting1: "value1" },
	"Fire": { setting1: "value1" },
	"Rain": { setting1: "value1" },
};
const presetBlade = particlesFolder.addBlade({
	view: "list",
	label: "Preset",
	options: presets,
	value: presets.Default,
});
presetBlade.on("change", (ev) => {
	console.log("Preset changed", ev.value);
});

const lifetimeFolder = particlesFolder.addFolder({ title: "Lifetime" });
const emissionRateBinding = particlesFolder.addBinding(PARAMS.particleSystem, "emissionRate", { min: 1, max: 10000, step: 5, label: "Emission Rate" });
const particleLifeBinding = lifetimeFolder.addBinding(PARAMS.particleSystem, "particleLife", { min: 0.1, max: 10.0, step: 0.1, label: "Lifetime (s)" });
const particleSpeedBinding = particlesFolder.addBinding(PARAMS.particleSystem, "particleSpeed", { min: 10, max: 1000, step: 1, label: "Particle Speed" });
const particleSizeBinding = particlesFolder.addBinding(PARAMS.particleSystem, "particleSize", { min: 1, max: 100, step: 1, label: "Particle Size" });
const fpsLimitBinding = particlesFolder.addBinding(PARAMS.particleSystem, "fpsLimit", { min: 0, max: 240, step: 1, label: "FPS Limit (0=unlimited)" });

const emitterFolder = pane.addFolder({ title: "Emitter" });
const emitterPosBinding = emitterFolder.addBinding(PARAMS.particleSystem, "emitterPosition", {
	x: { min: 0, max: 1, step: 0.01 },
	y: { min: 0, max: 1, step: 0.01 },
	label: "Position"
});
const emitterSizeBinding = emitterFolder.addBinding(PARAMS.particleSystem, "emitterSize", {
	x: { min: 0, max: 1, step: 0.01 },
	y: { min: 0, max: 1, step: 0.01 },
	label: "Size (W/H)"
});
const emitterDirectionBinding = emitterFolder.addBinding(PARAMS.particleSystem, "emitterDirection", {
	x: { min: -1, max: 1 },
	y: { min: -1, max: 1 },
	picker: "inline",
	expanded: true,
	label: "Direction"
});
const emitterSpreadBinding = emitterFolder.addBinding(PARAMS.particleSystem, "emitterSpread", {
	min: 0, max: 360, step: 1, label: "Spread"
});

const shapeFolder = pane.addFolder({ title: "Particle Shape" });
const shapeBinding = shapeFolder.addBinding(PARAMS.particleSystem, "particleShape", {
	options: {
		Circle: "circle",
		Square: "square",
		Image: "image",
	},
	label: "Shape"
});

const imageBinding = shapeFolder.addBinding(PARAMS.particleSystem, "particleImage", {
	view: "file-input",
	lineCount: 3,
	filetypes: [".png", ".jpg", ".jpeg", ".webp"],
	label: "Image"
});
imageBinding.hidden = PARAMS.particleSystem.particleShape !== "image";

const gradientBlade = particlesFolder.addBlade({
	view: "gradient",
	label: "Color Gradient",
	colorPicker: true,
	colorPickerProps: {
		layout: "inline",
	},
	alphaPicker: false,
	timePicker: true,
	initialPoints: [
		{ time: 0, value: { r: 255, g: 0, b: 0, a: 1 } },
		{ time: 1, value: { r: 0, g: 0, b: 255, a: 1 } },
	],
});

const opacityGradientBlade = lifetimeFolder.addBlade({
	view: "gradient",
	label: "Opacity Over Lifetime",
	colorPicker: true,
	alphaPicker: false,
	timePicker: true,
	initialPoints: [
		{ time: 0, value: { r: 255, g: 255, b: 255, a: 1 } },
		{ time: 1, value: { r: 0, g: 0, b: 0, a: 1 } },
	],
});

// Update PARAMS when gradient changes
gradientBlade.on("change", (ev) => {
	PARAMS.particleSystem.colorGradient = ev.value.points;
	particleSystem.updateConfig({ colorGradient: ev.value.points });
});

opacityGradientBlade.on("change", (ev) => {
	PARAMS.particleSystem.opacityGradient = ev.value.points;
	particleSystem.updateConfig({ opacityGradient: ev.value.points });
});

// Sync initial value
PARAMS.particleSystem.colorGradient = gradientBlade.value.points;
PARAMS.particleSystem.opacityGradient = opacityGradientBlade.value.points;

emissionRateBinding.on("change", (ev) => {
	particleSystem.updateConfig({ emissionRate: ev.value });
});
particleLifeBinding.on("change", (ev) => {
	particleSystem.updateConfig({ particleLife: ev.value });
});
particleSpeedBinding.on("change", (ev) => {
	particleSystem.updateConfig({ particleSpeed: ev.value });
});
particleSizeBinding.on("change", (ev) => {
	particleSystem.updateConfig({ particleSize: ev.value });
});
fpsLimitBinding.on("change", (ev) => {
	particleSystem.updateConfig({ fpsLimit: ev.value });
});
emitterPosBinding.on("change", (ev) => {
	particleSystem.updateConfig({ emitterPosition: ev.value });
});
emitterSizeBinding.on("change", (ev) => {
	particleSystem.updateConfig({ emitterSize: ev.value });
});
emitterDirectionBinding.on("change", (ev) => {
	const angle = Math.atan2(ev.value.y, ev.value.x) * (180 / Math.PI);
	PARAMS.particleSystem.emitterAngle = angle;
	particleSystem.updateConfig({ emitterAngle: angle });
});
emitterSpreadBinding.on("change", (ev) => {
	particleSystem.updateConfig({ emitterSpread: ev.value });
});
shapeBinding.on("change", (ev) => {
	particleSystem.updateConfig({ particleShape: ev.value });
	imageBinding.hidden = ev.value !== "image";
});
imageBinding.on("change", (ev) => {
	if (ev.value) {
		const url = URL.createObjectURL(ev.value);
		particleSystem.updateConfig({ particleImage: url });
	} else {
		particleSystem.updateConfig({ particleImage: null });
	}
});

pane.addBlade({ view: "separator" });
const exportButton = pane.addButton({ title: "Export JSON" });
exportButton.on("click", () => {
	// Filter out any transient view state if it were in PARAMS, 
	// but here we kept it separate.
	const json = JSON.stringify(PARAMS, null, 2);
	console.log(json);
	alert("Configuration exported to console!");
});

// Update canvas on change
const canvas = getID("preview-canvas");
const previewContainer = canvas.parentElement;

// Initialize WebGLitter
const particleSystem = new WebGLitter(canvas, PARAMS.particleSystem);

function updateBrowserZoom() {
	const dpr = window.devicePixelRatio || 1;
	document.documentElement.style.setProperty("--browser-zoom", dpr);
}

function updateCanvasTransform() {
	canvas.style.transform = `translate(${viewState.offset.x}px, ${viewState.offset.y}px) scale(${viewState.zoom})`;
}

function updateCanvas() {
	canvas.width = PARAMS.canvas.width;
	canvas.height = PARAMS.canvas.height;
	canvas.style.backgroundColor = PARAMS.canvas.backgroundColor;
	
	if (particleSystem) {
		particleSystem.gl.viewport(0, 0, canvas.width, canvas.height);
	}

	if (viewState.autoFit) {
		fitToViewport();
	}
	updateCanvasTransform();
}

function fitToViewport() {
	const padding = 40;
	const dpr = window.devicePixelRatio || 1;
	const availableWidth = (previewContainer.clientWidth * dpr) - padding;
	const availableHeight = (previewContainer.clientHeight * dpr) - padding;
	
	const scaleX = availableWidth / PARAMS.canvas.width;
	const scaleY = availableHeight / PARAMS.canvas.height;
	
	viewState.zoom = Math.min(scaleX, scaleY, 1);
	viewState.offset = { x: 0, y: 0 };
	zoomBinding.refresh();
}

// Interaction Listeners
const activePointers = new Map();
let initialPinchDistance = 0;
let initialPinchZoom = 1;

previewContainer.addEventListener("pointerdown", (e) => {
	if (e.pointerType === "mouse" && e.button !== 0) return;
	activePointers.set(e.pointerId, e);
	
	if (activePointers.size === 1) {
		previewContainer.style.cursor = "grabbing";
	} else if (activePointers.size === 2) {
		const pointers = Array.from(activePointers.values());
		initialPinchDistance = Math.hypot(
			pointers[0].clientX - pointers[1].clientX,
			pointers[0].clientY - pointers[1].clientY
		);
		initialPinchZoom = viewState.zoom;
	}
});

window.addEventListener("pointermove", (e) => {
	if (!activePointers.has(e.pointerId)) return;
	
	const prevPointer = activePointers.get(e.pointerId);
	const dpr = window.devicePixelRatio || 1;

	if (activePointers.size === 1) {
		const dx = e.clientX - prevPointer.clientX;
		const dy = e.clientY - prevPointer.clientY;
		
		viewState.offset.x += dx * dpr;
		viewState.offset.y += dy * dpr;
		viewState.autoFit = false;
		updateCanvasTransform();
	} else if (activePointers.size === 2) {
		// Update this pointer to get latest position for distance calculation
		activePointers.set(e.pointerId, e);
		const pointers = Array.from(activePointers.values());
		const currentDistance = Math.hypot(
			pointers[0].clientX - pointers[1].clientX,
			pointers[0].clientY - pointers[1].clientY
		);
		
		if (initialPinchDistance > 0) {
			const zoomFactor = currentDistance / initialPinchDistance;
			const newZoom = Math.min(Math.max(initialPinchZoom * zoomFactor, 0.1), 5);
			
			viewState.zoom = newZoom;
			viewState.autoFit = false;
			zoomBinding.refresh();
			updateCanvasTransform();
		}
	}
	
	activePointers.set(e.pointerId, e);
});

const handlePointerUp = (e) => {
	activePointers.delete(e.pointerId);
	if (activePointers.size === 0) {
		previewContainer.style.cursor = "crosshair";
	}
};

window.addEventListener("pointerup", handlePointerUp);
window.addEventListener("pointercancel", handlePointerUp);

previewContainer.addEventListener("wheel", (e) => {
	e.preventDefault();
	const zoomSpeed = 0.001;
	const delta = -e.deltaY;
	const newZoom = Math.min(Math.max(viewState.zoom + delta * zoomSpeed, 0.1), 5);
	
	viewState.zoom = newZoom;
	viewState.autoFit = false;
	zoomBinding.refresh();
	updateCanvasTransform();
}, { passive: false });

previewContainer.addEventListener("dblclick", () => {
	viewState.zoom = 1;
	viewState.offset = { x: 0, y: 0 };
	viewState.autoFit = false;
	zoomBinding.refresh();
	updateCanvasTransform();
});

zoomBinding.on("change", (ev) => {
	if (ev.last) viewState.autoFit = false; // Only if changed via UI
	updateCanvasTransform();
});

window.addEventListener("resize", () => {
	updateBrowserZoom();
	if (!viewState.autoFit) return;
	fitToViewport();
	updateCanvasTransform();
});

canvasWidth.on("change", updateCanvas);
canvasHeight.on("change", updateCanvas);
canvasBg.on("change", updateCanvas);

// Initial call
updateBrowserZoom();
updateCanvas();

// Resizable Controls Panel
const controlsPanel = getID("controls");
const resizeHandle = controlsPanel.querySelector(".resize-handle");
const toggleControlsButton = document.querySelector(".toggle-controls");

let panelIsResizing = false;
const DEFAULT_PANEL_WIDTH = 290;
const COLLAPSED_PANEL_WIDTH = 180; // Threshold to hide the panel

function startResize(e) {
	if (e.pointerType === "mouse" && e.button !== 0) return;
	panelIsResizing = true;
	document.body.style.cursor = "ew-resize";
	document.body.style.userSelect = "none";
	controlsPanel.style.transition = "none"; // Disable transition during resize
}

function collapsePanel() {
	controlsPanel.classList.add("collapsed");
	toggleControlsButton.classList.remove("hidden");
	pane.refresh(); // Refresh Tweakpane to adjust layout
	
	if (viewState.autoFit) {
		fitToViewport();
		updateCanvasTransform();
	}
}

function resizePanel(e) {
	if (!panelIsResizing) return;
	
	let newWidth = e.clientX;
	
	if (newWidth < COLLAPSED_PANEL_WIDTH) {
		collapsePanel();
		return;
	}
	
	controlsPanel.classList.remove("collapsed");
	toggleControlsButton.classList.add("hidden");
	
	controlsPanel.style.width = `${newWidth}px`;
	pane.refresh(); // Refresh Tweakpane to adjust layout
	
	if (viewState.autoFit) {
		fitToViewport();
		updateCanvasTransform();
	}
}

function stopResize() {
	panelIsResizing = false;
	document.body.style.userSelect = "";
	document.body.style.cursor = "default";
	controlsPanel.style.transition = ""; // Re-enable transition
}

resizeHandle.addEventListener("pointerdown", startResize);
window.addEventListener("pointermove", resizePanel);
window.addEventListener("pointerup", stopResize);

toggleControlsButton.addEventListener("click", () => {
	if (!controlsPanel.classList.contains("collapsed")) return;
	controlsPanel.classList.remove("collapsed");
	controlsPanel.style.width = `${DEFAULT_PANEL_WIDTH}px`; // Restore to last known width
	toggleControlsButton.classList.add("hidden");
	pane.expanded = true;
	pane.refresh(); // Refresh Tweakpane

	if (viewState.autoFit) {
		fitToViewport();
		updateCanvasTransform();
	}
});

pane.on("fold", (ev) => {
	if (ev.expanded) return;
	collapsePanel();
});

if (window.innerWidth < 600) {
	collapsePanel();
}


// DEBUG STUFF HERE:
async function loadDebug() {
	if (process.env.DEBUG !== "true") return;
	console.log("%c Debugging is ON!", "font-size: 20px; color: red;");
	
	const DEBUG = await import("./modules/debug.js");
	// DEBUG.debugTest();
}
loadDebug();