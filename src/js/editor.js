import { getID } from "./modules/utils";
import { Pane } from "tweakpane";
import { GradientPluginBundle } from "tweakpane-plugin-gradient";
import * as TweakpaneFileImportPlugin from "tweakpane-plugin-file-import";
import WebGLitter from "./WebGLitter.js";
import { exportJSON, exportHTML, uiToLibrary, libraryToUI } from "./modules/exporters";
import { presets, DEFAULT_CONFIG } from "./modules/presets";
import { updateGradientBladeValue } from "./modules/tweakpaneUtils.js";

const debugging = process.env.DEBUG == "true";

const PARAMS = {
	canvas: {
		size: { x: 1280, y: 720 },
		backgroundColor: "#000000ff",
	},
	particleSystem: {
		emissionRate: DEFAULT_CONFIG.emissionRate,
		particleLife: DEFAULT_CONFIG.particleLife,
		particleSpeed: DEFAULT_CONFIG.particleSpeed,
		particleSize: DEFAULT_CONFIG.particleSize,
		scaleMode: DEFAULT_CONFIG.scaleMode || "constant",
		scaleGradient: null,
		particleDimensions: { ...DEFAULT_CONFIG.particleDimensions },
		fpsLimit: DEFAULT_CONFIG.fpsLimit || 60,
		emitterPosition: { x: (DEFAULT_CONFIG.emitterPosition.x * 2) - 1, y: (DEFAULT_CONFIG.emitterPosition.y * 2) - 1 },
		emitterSize: { ...DEFAULT_CONFIG.emitterSize },
		emitterAngle: DEFAULT_CONFIG.emitterAngle,
		emitterDirection: { x: 1, y: 0 }, // Will be updated by Sync logic below
		emitterSpread: DEFAULT_CONFIG.emitterSpread,
		particleShape: DEFAULT_CONFIG.particleShape,
		particleImage: DEFAULT_CONFIG.particleImage || "",
		scaleMode: DEFAULT_CONFIG.scaleMode,
		scaleGradient: null,
		colorGradient: null,
		opacityGradient: null,
		interactionType: DEFAULT_CONFIG.interactionType,
		repelRadius: DEFAULT_CONFIG.repelRadius,
		repelStrength: DEFAULT_CONFIG.repelStrength,
		gravity: { ...DEFAULT_CONFIG.gravity },
		blendMode: DEFAULT_CONFIG.blendMode,
		swayType: DEFAULT_CONFIG.swayType,
		swayAmount: DEFAULT_CONFIG.swayAmount,
		swayFrequency: DEFAULT_CONFIG.swayFrequency,
	},
};

// Sync direction and angle initially
const initialRad = (PARAMS.particleSystem.emitterAngle || 0) * (Math.PI / 180);
PARAMS.particleSystem.emitterDirection.x = Math.cos(initialRad);
PARAMS.particleSystem.emitterDirection.y = Math.sin(initialRad);

const pane = new Pane({
	container: getID("controls"),
	title: "WebGLitter Editor",
});

pane.registerPlugin(GradientPluginBundle);
pane.registerPlugin(TweakpaneFileImportPlugin.default || TweakpaneFileImportPlugin);

let particleSystem; // Shared system instance
const blades = {}; // Store blade references
let isLoadingPreset = false; // Prevent logic during programmatic loading

// Mapping helper for single properties
const mapToLibrary = (key, val) => {
	if (key === "emitterPosition") {
		return { x: (val.x + 1) / 2, y: (val.y + 1) / 2 };
	}
	if (key === "colorGradient" || key === "opacityGradient" || key === "scaleGradient") {
		return val.map(p => ({
			time: p.time,
			value: [p.value.r, p.value.g, p.value.b, p.value.a]
		}));
	}
	return val;
};

// Helper to reduce boilerplate for particle system bindings
const bindParticle = (folder, key, options, customChange) => {
	const binding = folder.addBinding(PARAMS.particleSystem, key, options);
	binding.on("change", (ev) => {
		if (!particleSystem) return;
		if (customChange) {
			customChange(ev.value, binding);
		} else {
			if (isLoadingPreset) return;
			particleSystem.updateConfig({ [key]: mapToLibrary(key, ev.value) });
		}
	});
	return binding;
};

const bindGradient = (folder, key, label, initialPoints, colorPicker = true, alphaPicker = false) => {
	const blade = folder.addBlade({
		view: "gradient",
		label: label,
		colorPicker,
		colorPickerProps: { layout: "inline" },
		alphaPicker,
		timePicker: true,
		initialPoints: initialPoints,
	});
	blades[key] = blade;
	PARAMS.particleSystem[key] = blade.value.points;
	blade.on("change", (ev) => {
		if (isLoadingPreset) return;
		PARAMS.particleSystem[key] = ev.value.points;
		if (particleSystem) {
			particleSystem.updateConfig({ [key]: mapToLibrary(key, ev.value.points) });
		}
	});
	return blade;
};

const refreshPreview = () => {
	updateCanvas();
	if (!particleSystem) return;
	
	const config = uiToLibrary(PARAMS);

	// Handle particle image if it's a File object from Tweakpane
	if (PARAMS.particleSystem.particleImage instanceof File) {
		config.particleImage = URL.createObjectURL(PARAMS.particleSystem.particleImage);
	}

	particleSystem.updateConfig(config);
	particleSystem.restart();
};

const canvasFolder = pane.addFolder({ title: "Canvas and Preview" });

canvasFolder.addBinding(PARAMS.canvas, "size", {
	x: { min: 100, max: 2000, step: 1 },
	y: { min: 100, max: 2000, step: 1 },
	label: "Canvas Size"
}).on("change", () => updateCanvas());

canvasFolder.addBinding(PARAMS.canvas, "backgroundColor", {
	view: "color",
	label: "BG Color",
	alpha: true
}).on("change", () => updateCanvas());

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

bindParticle(canvasFolder, "fpsLimit", { min: 0, max: 240, step: 1, label: "FPS Limit (0=no limit)" });


canvasFolder.addButton({ title: "Refresh Preview" }).on("click", () => {
	refreshPreview();
});

const particlesFolder = pane.addFolder({ title: "Particles" });

const presetBlade = particlesFolder.addBlade({
	view: "list",
	label: "Preset",
	options: presets,
	value: presets.Default,
});

presetBlade.on("change", (ev) => {
	const preset = ev.value;
	if (!preset) return;

	isLoadingPreset = true;

	// Reset to defaults first to ensure properties not in the preset are cleared
	const defaultsUI = libraryToUI(DEFAULT_CONFIG);
	const applyData = (data) => {
		Object.keys(data).forEach(key => {
			if (key === "colorGradient" || key === "opacityGradient" || key === "scaleGradient") {
				return;
			}
			if (typeof data[key] === "object" && data[key] !== null && PARAMS.particleSystem[key]) {
				Object.assign(PARAMS.particleSystem[key], data[key]);
			} else {
				PARAMS.particleSystem[key] = data[key];
			}
		});
	};

	applyData(defaultsUI);
	// Reset emitterDirection manually since it's a UI-only derived property
	const radDefault = (DEFAULT_CONFIG.emitterAngle || 0) * (Math.PI / 180);
	PARAMS.particleSystem.emitterDirection.x = Math.cos(radDefault);
	PARAMS.particleSystem.emitterDirection.y = Math.sin(radDefault);

	// Convert Library format (Preset) to UI format (Editor)
	const uiData = libraryToUI(preset);

	// Apply preset data
	applyData(uiData);

	// Load gradients (need manual blade update)
	const updateGradientBlade = (key, uiPoints) => {
		const blade = blades[key];
		if (!blade || !uiPoints) return;

		PARAMS.particleSystem[key] = updateGradientBladeValue(blade, uiPoints, debugging);
	};

	updateGradientBlade("colorGradient", uiData.colorGradient);
	updateGradientBlade("opacityGradient", uiData.opacityGradient);
	updateGradientBlade("scaleGradient", uiData.scaleGradient);

	// Sync direction and angle
	if (preset.emitterDirection) {
		const angle = Math.atan2(preset.emitterDirection.y, preset.emitterDirection.x) * (180 / Math.PI);
		PARAMS.particleSystem.emitterAngle = angle;
	} else if (preset.emitterAngle !== undefined) {
		const rad = preset.emitterAngle * (Math.PI / 180);
		PARAMS.particleSystem.emitterDirection.x = Math.cos(rad);
		PARAMS.particleSystem.emitterDirection.y = Math.sin(rad);
	}

	pane.refresh();
	
	// Update manual visibility logic
	updateScaleVisibility(PARAMS.particleSystem.scaleMode);
	updateSwayVisibility(PARAMS.particleSystem.swayType);
	updateInteractionVisibility(PARAMS.particleSystem.interactionType);
	imageBinding.hidden = PARAMS.particleSystem.particleShape !== "image";

	refreshPreview();
	isLoadingPreset = false;
});

bindParticle(particlesFolder, "blendMode", {
	options: {
		Additive: "additive",
		Normal: "normal",
		Screen: "screen",
	},
	label: "Blend Mode"
});

const shapeFolder = particlesFolder.addFolder({ title: "Shape" });
bindParticle(shapeFolder, "particleShape", {
	options: {
		"Circle (soft)": "softCircle",
		Circle: "circle",
		Rectangle: "rectangle",
		Image: "image",
	},
	label: "Shape"
}, (val) => {
	if (isLoadingPreset) return;
	particleSystem.updateConfig({ particleShape: val });
	imageBinding.hidden = val !== "image";
});

const scaleModeBinding = bindParticle(shapeFolder, "scaleMode", {
	options: {
		"Constant": "constant",
		"Variable": "variable",
	},
	label: "Scale Mode"
}, (val) => {
	if (isLoadingPreset) return;

	const currentScale = PARAMS.particleSystem.particleSize / 100;
	let newPts = [];
	if (val === "constant") {
		newPts = [
			{ time: 0, value: { r: 255, g: 255, b: 255, a: currentScale } },
			{ time: 1, value: { r: 255, g: 255, b: 255, a: currentScale } }
		];
	} else {
		newPts = [
			{ time: 0, value: { r: 255, g: 255, b: 255, a: currentScale } },
			{ time: 1, value: { r: 255, g: 255, b: 255, a: 0 } }
		];
	}

	const blade = blades.scaleGradient;
	if (blade) {
		PARAMS.particleSystem.scaleGradient = updateGradientBladeValue(blade, newPts, debugging);
	}

	particleSystem.updateConfig({ 
		scaleMode: val,
		scaleGradient: mapToLibrary("scaleGradient", PARAMS.particleSystem.scaleGradient) 
	});
	updateScaleVisibility(val);
});

const scaleConstantBinding = bindParticle(shapeFolder, "particleSize", { min: 1, max: 100, step: 1, label: "Scale (%)" }, (val) => {
	if (isLoadingPreset) return;
	
	// Synchronize Constant slider to update scaleGradient to constant value points
	const alpha = val / 100;
	const pts = [
		{ time: 0, value: { r: 255, g: 255, b: 255, a: alpha } },
		{ time: 1, value: { r: 255, g: 255, b: 255, a: alpha } }
	];

	const blade = blades.scaleGradient;
	if (blade) {
		PARAMS.particleSystem.scaleGradient = updateGradientBladeValue(blade, pts, debugging);
	}

	particleSystem.updateConfig({ 
		particleSize: val, 
		scaleGradient: mapToLibrary("scaleGradient", PARAMS.particleSystem.scaleGradient) 
	});
});

const scaleGradientBlade = bindGradient(shapeFolder, "scaleGradient", "Scale Gradient", [
	{ time: 0, value: { r: 255, g: 255, b: 255, a: DEFAULT_CONFIG.particleSize / 100 } },
	{ time: 1, value: { r: 255, g: 255, b: 255, a: DEFAULT_CONFIG.particleSize / 100 } },
], false, true);

function updateScaleVisibility(val) {
	const isConstant = val === "constant";
	scaleConstantBinding.hidden = !isConstant;
	blades.scaleGradient.hidden = isConstant;
}
updateScaleVisibility(PARAMS.particleSystem.scaleMode);

bindParticle(shapeFolder, "particleDimensions", {
	x: { min: 1, max: 1000, step: 1 },
	y: { min: 1, max: 1000, step: 1 },
	label: "Dimensions (W/H)"
});

const imageBinding = bindParticle(shapeFolder, "particleImage", {
	view: "file-input",
	lineCount: 3,
	filetypes: [".png", ".jpg", ".jpeg", ".webp", ".avif"],
	label: "Image"
}, (val) => {
	if (isLoadingPreset) return;
	if (val) {
		const url = URL.createObjectURL(val);
		particleSystem.updateConfig({ particleImage: url });
	} else {
		particleSystem.updateConfig({ particleImage: null });
	}
});
imageBinding.hidden = PARAMS.particleSystem.particleShape !== "image";

const lifetimeFolder = particlesFolder.addFolder({ title: "Lifetime & Motion" });
bindParticle(lifetimeFolder, "particleLife", { min: 0.1, max: 10.0, step: 0.1, label: "Lifetime (s)" });
bindParticle(lifetimeFolder, "particleSpeed", { min: 0, max: 1000, step: 1, label: "Particle Speed" });

const swayTypeBinding = bindParticle(lifetimeFolder, "swayType", {
	options: {
		"None": "none",
		"Sine": "sine",
		"Zig-Zag": "zigzag",
		"Circular": "circular",
	},
	label: "Sway Type"
});
const swayAmountBinding = bindParticle(lifetimeFolder, "swayAmount", { min: 0, max: 200, step: 1, label: "Sway Amount" });
const swayFreqBinding = bindParticle(lifetimeFolder, "swayFrequency", { min: 0.1, max: 10, step: 0.1, label: "Sway Freq" });

const updateSwayVisibility = (val) => {
	const isEnabled = val !== "none";
	swayAmountBinding.hidden = !isEnabled;
	swayFreqBinding.hidden = !isEnabled;
};
swayTypeBinding.on("change", (ev) => updateSwayVisibility(ev.value));
updateSwayVisibility(PARAMS.particleSystem.swayType);

bindGradient(lifetimeFolder, "opacityGradient", "Fade", [
	{ time: 0, value: { r: 255, g: 255, b: 255, a: 1 } },
	{ time: 1, value: { r: 255, g: 255, b: 255, a: 0 } },
], false, true);

const physicsFolder = particlesFolder.addFolder({ title: "Physics" });
bindParticle(physicsFolder, "gravity", {
	x: { min: -2000, max: 2000, step: 1 },
	y: { min: -2000, max: 2000, step: 1 },
	label: "Gravity (px/s²)"
});

bindGradient(particlesFolder, "colorGradient", "Color", [
	{ time: 0, value: { r: 255, g: 0, b: 0, a: 1 } },
	{ time: 1, value: { r: 0, g: 0, b: 255, a: 1 } },
]);

const emitterFolder = pane.addFolder({ title: "Emitter" });

bindParticle(emitterFolder, "emissionRate", { min: 1, max: 10000, step: 5, label: "Emission Rate" });

const emitterPosBinding = bindParticle(emitterFolder, "emitterPosition", {
	x: { min: -1, max: 1, step: 0.01 },
	y: { min: -1, max: 1, step: 0.01 },
	label: "Position"
}, (val) => {
	if (isLoadingPreset) return;
	particleSystem.updateConfig({ 
		emitterPosition: mapToLibrary("emitterPosition", val) 
	});
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
	if (isLoadingPreset) return;
	const angle = Math.atan2(val.y, val.x) * (180 / Math.PI);
	PARAMS.particleSystem.emitterAngle = angle;
	particleSystem.updateConfig({ emitterAngle: angle });
});

bindParticle(emitterFolder, "emitterSpread", {
	min: 0, max: 360, step: 1, label: "Spread"
});

const interactionFolder = pane.addFolder({ title: "Interaction" });
const interactionTypeBinding = bindParticle(interactionFolder, "interactionType", {
	options: {
		"None": "none",
		"Follow Pointer": "follow",
		"Repel Pointer": "repel",
	},
	label: "Type"
});

const repelRadiusBinding = bindParticle(interactionFolder, "repelRadius", { min: 10, max: 1000, step: 1, label: "Repel Radius" });
const repelStrengthBinding = bindParticle(interactionFolder, "repelStrength", { min: 10, max: 5000, step: 10, label: "Repel Strength" });

const updateInteractionVisibility = (val) => {
	const isRepel = val === "repel";
	repelRadiusBinding.hidden = !isRepel;
	repelStrengthBinding.hidden = !isRepel;
};

interactionTypeBinding.on("change", (ev) => updateInteractionVisibility(ev.value));
updateInteractionVisibility(PARAMS.particleSystem.interactionType);

// Export Logic
const exportFolder = pane.addFolder({ title: "Export" });
const exportParams = {
	format: "json",
};
exportFolder.addBinding(exportParams, "format", {
	options: {
		JSON: "json",
		HTML: "html",
	},
	label: "Format"
});

const exportButton = exportFolder.addButton({ title: "Export" });
exportButton.on("click", () => {
	if (exportParams.format === "json") {
		exportJSON(PARAMS);
	} else if (exportParams.format === "html") {
		exportHTML(PARAMS);
	}
});

const canvas = getID("preview-canvas");
const previewContainer = canvas.parentElement;

// Initialize WebGLitter
particleSystem = new WebGLitter(canvas, uiToLibrary(PARAMS));

function updateBrowserZoom() {
	const dpr = window.devicePixelRatio || 1;
	document.documentElement.style.setProperty("--browser-zoom", dpr);
}

function updateCanvasTransform() {
	canvas.style.transform = `translate(${viewState.offset.x}px, ${viewState.offset.y}px) scale(${viewState.zoom})`;
}

function updateCanvas() {
	canvas.width = PARAMS.canvas.size.x;
	canvas.height = PARAMS.canvas.size.y;
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
	
	const scaleX = availableWidth / PARAMS.canvas.size.x;
	const scaleY = availableHeight / PARAMS.canvas.size.y;
	
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
const resizeHandle = document.querySelector(".resize-handle");
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
