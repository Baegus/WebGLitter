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
		emitterPosition: { x: 0, y: 0 },
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
const bindCanvas = (key, options) => canvasFolder.addBinding(PARAMS.canvas, key, options).on("change", () => updateCanvas());

bindCanvas("width", { min: 100, max: 2000, step: 1 });
bindCanvas("height", { min: 100, max: 2000, step: 1 });
bindCanvas("backgroundColor", { view: "color", alpha: true });

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

let particleSystem; // Declare early so bindings can use it

// Helper to reduce boilerplate for particle system bindings
const bindParticle = (folder, key, options, customChange) => {
	const binding = folder.addBinding(PARAMS.particleSystem, key, options);
	binding.on("change", (ev) => {
		if (!particleSystem) return;
		if (customChange) {
			customChange(ev.value, binding);
		} else {
			particleSystem.updateConfig({ [key]: ev.value });
		}
	});
	return binding;
};

bindParticle(particlesFolder, "emissionRate", { min: 1, max: 10000, step: 5, label: "Emission Rate" });
bindParticle(lifetimeFolder, "particleLife", { min: 0.1, max: 10.0, step: 0.1, label: "Lifetime (s)" });
bindParticle(particlesFolder, "particleSpeed", { min: 10, max: 1000, step: 1, label: "Particle Speed" });
bindParticle(particlesFolder, "particleSize", { min: 1, max: 100, step: 1, label: "Particle Size" });
bindParticle(particlesFolder, "fpsLimit", { min: 0, max: 240, step: 1, label: "FPS Limit (0=unlimited)" });

const emitterFolder = pane.addFolder({ title: "Emitter" });
const emitterPosBinding = bindParticle(emitterFolder, "emitterPosition", {
	x: { min: -1, max: 1, step: 0.01 },
	y: { min: -1, max: 1, step: 0.01 },
	label: "Position"
}, (val) => {
	const x = (val.x + 1) / 2;
	const y = (val.y + 1) / 2;
	particleSystem.updateConfig({ emitterPosition: { x, y } });
});

bindParticle(emitterFolder, "emitterSize", {
	x: { min: 0, max: 1, step: 0.01 },
	y: { min: 0, max: 1, step: 0.01 },
	label: "Size (W/H)"
});

bindParticle(emitterFolder, "emitterDirection", {
	x: { min: -1, max: 1 },
	y: { min: -1, max: 1 },
	picker: "inline",
	expanded: true,
	label: "Direction"
}, (val) => {
	const angle = Math.atan2(val.y, val.x) * (180 / Math.PI);
	PARAMS.particleSystem.emitterAngle = angle;
	particleSystem.updateConfig({ emitterAngle: angle });
});

bindParticle(emitterFolder, "emitterSpread", {
	min: 0, max: 360, step: 1, label: "Spread"
});

const shapeFolder = pane.addFolder({ title: "Particle Shape" });
bindParticle(shapeFolder, "particleShape", {
	options: {
		Circle: "circle",
		Square: "square",
		Image: "image",
	},
	label: "Shape"
}, (val) => {
	particleSystem.updateConfig({ particleShape: val });
	imageBinding.hidden = val !== "image";
});

const imageBinding = bindParticle(shapeFolder, "particleImage", {
	view: "file-input",
	lineCount: 3,
	filetypes: [".png", ".jpg", ".jpeg", ".webp"],
	label: "Image"
}, (val) => {
	if (val) {
		const url = URL.createObjectURL(val);
		particleSystem.updateConfig({ particleImage: url });
	} else {
		particleSystem.updateConfig({ particleImage: null });
	}
});
imageBinding.hidden = PARAMS.particleSystem.particleShape !== "image";

const bindGradient = (folder, key, label, initialPoints, alphaPicker = false) => {
	const blade = folder.addBlade({
		view: "gradient",
		label: label,
		colorPicker: true,
		colorPickerProps: { layout: "inline" },
		alphaPicker: alphaPicker,
		timePicker: true,
		initialPoints: initialPoints,
	});
	PARAMS.particleSystem[key] = blade.value.points;
	blade.on("change", (ev) => {
		PARAMS.particleSystem[key] = ev.value.points;
		if (particleSystem) particleSystem.updateConfig({ [key]: ev.value.points });
	});
	return blade;
};

bindGradient(particlesFolder, "colorGradient", "Color Gradient", [
	{ time: 0, value: { r: 255, g: 0, b: 0, a: 1 } },
	{ time: 1, value: { r: 0, g: 0, b: 255, a: 1 } },
]);

bindGradient(lifetimeFolder, "opacityGradient", "Opacity Over Lifetime", [
	{ time: 0, value: { r: 255, g: 255, b: 255, a: 1 } },
	{ time: 1, value: { r: 0, g: 0, b: 0, a: 1 } },
]);

pane.addBlade({ view: "separator" });
const exportButton = pane.addButton({ title: "Export JSON" });
exportButton.on("click", () => {
	// Filter out any transient view state if it were in PARAMS, 
	// but here we kept it separate.
	const json = JSON.stringify(PARAMS, null, 2);
	console.log(json);
	alert("Configuration exported to console!");
});

const canvas = getID("preview-canvas");
const previewContainer = canvas.parentElement;

// Initialize WebGLitter
particleSystem = new WebGLitter(canvas, PARAMS.particleSystem);

// Trigger initial position conversion
const initialPos = emitterPosBinding.controller.value.rawValue;
particleSystem.updateConfig({ 
	emitterPosition: { 
		x: (initialPos.x + 1) / 2, 
		y: (initialPos.y + 1) / 2 
	} 
});

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

function refreshLayout() {
	pane.refresh();
	if (viewState.autoFit) {
		fitToViewport();
		updateCanvasTransform();
	}
}

function collapsePanel() {
	controlsPanel.classList.add("collapsed");
	toggleControlsButton.classList.remove("hidden");
	refreshLayout();
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
	refreshLayout();
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
	refreshLayout();
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