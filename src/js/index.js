import { getID } from "./modules/utils";
import { Pane } from "tweakpane";
import { GradientPluginBundle } from "tweakpane-plugin-gradient";

const debugging = process.env.DEBUG == "true";

const PARAMS = {
	canvas: {
		width: 1280,
		height: 720,
		backgroundColor: "#000000ff",
	},
	particleSystem: {
		colorGradient: null, // Will be managed by the blade
	},
};

const pane = new Pane({
	container: getID("controls"),
	title: "WebGLitter Editor",
});

pane.registerPlugin(GradientPluginBundle);

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

const gradientBlade = particlesFolder.addBlade({
	view: "gradient",
	label: "Color Gradient",
	colorPicker: true,
	colorPickerProps: {
		layout: "inline",
		expanded: true,
	},
	alphaPicker: true,
	timePicker: true,
	initialPoints: [
		{ time: 0, value: { r: 255, g: 0, b: 0, a: 1 } },
		{ time: 1, value: { r: 0, g: 0, b: 255, a: 1 } },
	],
});

// Update PARAMS when gradient changes
gradientBlade.on("change", (ev) => {
	PARAMS.particleSystem.colorGradient = ev.value.points;
});

// Sync initial value
PARAMS.particleSystem.colorGradient = gradientBlade.value.points;

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

function updateCanvasTransform() {
	canvas.style.transform = `translate(${viewState.offset.x}px, ${viewState.offset.y}px) scale(${viewState.zoom})`;
}

function updateCanvas() {
	canvas.width = PARAMS.canvas.width;
	canvas.height = PARAMS.canvas.height;
	canvas.style.backgroundColor = PARAMS.canvas.backgroundColor;
	
	if (viewState.autoFit) {
		fitToViewport();
	}
	updateCanvasTransform();
}

function fitToViewport() {
	const padding = 40;
	const availableWidth = previewContainer.clientWidth - padding;
	const availableHeight = previewContainer.clientHeight - padding;
	
	const scaleX = availableWidth / PARAMS.canvas.width;
	const scaleY = availableHeight / PARAMS.canvas.height;
	
	viewState.zoom = Math.min(scaleX, scaleY, 1);
	viewState.offset = { x: 0, y: 0 };
	zoomBinding.refresh();
}

// Interaction Listeners
let isDragging = false;
let lastMousePos = { x: 0, y: 0 };

previewContainer.addEventListener("pointerdown", (e) => {
	if (e.button !== 0) return; // Left click only
	isDragging = true;
	lastMousePos = { x: e.clientX, y: e.clientY };
	previewContainer.style.cursor = "grabbing";
});

window.addEventListener("pointermove", (e) => {
	if (!isDragging) return;
	
	const dx = e.clientX - lastMousePos.x;
	const dy = e.clientY - lastMousePos.y;
	
	viewState.offset.x += dx;
	viewState.offset.y += dy;
	viewState.autoFit = false;
	
	lastMousePos = { x: e.clientX, y: e.clientY };
	updateCanvasTransform();
});

window.addEventListener("pointerup", () => {
	isDragging = false;
	previewContainer.style.cursor = "crosshair";
});

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
	if (!viewState.autoFit) return;
	fitToViewport();
	updateCanvasTransform();
});

canvasWidth.on("change", updateCanvas);
canvasHeight.on("change", updateCanvas);
canvasBg.on("change", updateCanvas);

// Initial call
updateCanvas();

// Resizable Controls Panel
const controlsPanel = getID("controls");
const resizeHandle = controlsPanel.querySelector(".resize-handle");
const toggleControlsButton = document.querySelector(".toggle-controls");

let panelIsResizing = false;
const DEFAULT_PANEL_WIDTH = 290;
const COLLAPSED_PANEL_WIDTH = 180; // Threshold to hide the panel

function startResize(e) {
	panelIsResizing = true;
	document.body.style.cursor = "ew-resize";
	document.body.style.userSelect = "none";
	controlsPanel.style.transition = "none"; // Disable transition during resize
}

function resizePanel(e) {
	if (!panelIsResizing) return;
	
	let newWidth = e.clientX;
	
	if (newWidth < COLLAPSED_PANEL_WIDTH) {
		controlsPanel.classList.add("collapsed");
		toggleControlsButton.classList.remove("hidden");
		pane.refresh(); // Refresh Tweakpane to adjust layout
		return;
	}
	
	controlsPanel.classList.remove("collapsed");
	toggleControlsButton.classList.add("hidden");
	
	controlsPanel.style.width = `${newWidth}px`;
	pane.refresh(); // Refresh Tweakpane to adjust layout
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
	pane.refresh(); // Refresh Tweakpane
});


// DEBUG STUFF HERE:
async function loadDebug() {
	if (process.env.DEBUG !== "true") return;
	console.log("%c Debugging is ON!", "font-size: 20px; color: red;");
	
	const DEBUG = await import("./modules/debug.js");
	// DEBUG.debugTest();
}
loadDebug();