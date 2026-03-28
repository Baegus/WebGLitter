import { getID, addCl, remCl } from "./modules/utils";
import { Pane } from "tweakpane";
import { GradientPluginBundle } from "tweakpane-plugin-gradient";
import * as TweakpaneFileImportPlugin from "tweakpane-plugin-file-import";
import * as EssentialsPlugin from "@tweakpane/plugin-essentials";
import WebGLitter from "./WebGLitter.js";
import { exportJSON, exportJSONZip, exportJSONBase64, exportHTML, uiToLibrary, libraryToUI } from "./modules/exporters";
import { presets, DEFAULT_CONFIG } from "./modules/presets";
import { updateGradientBladeValue, enableTouchDeleteForGradient } from "./modules/tweakpaneUtils.js";

const debugging = process.env.DEBUG == "true";

const PARAMS = {
	canvas: {
		size: { x: 1280, y: 720 },
		backgroundColor: "#000000ff",
	},
	particleSystem: {
		emissionRate: DEFAULT_CONFIG.emissionRate,
		particleLife: DEFAULT_CONFIG.particleLife,
		speedMode: DEFAULT_CONFIG.speedMode || "constant",
		particleSpeed: DEFAULT_CONFIG.particleSpeed,
		speedRandom: { ...DEFAULT_CONFIG.speedRandom } || { min: 10, max: 100 },
		speedGradient: null,
		particleSize: DEFAULT_CONFIG.particleSize,
		scaleMode: DEFAULT_CONFIG.scaleMode || "constant",
		scaleGradient: null,
		scaleRandom: DEFAULT_CONFIG.scaleRandom || { min: 50, max: 100 },
		particleDimensions: { ...DEFAULT_CONFIG.particleDimensions },
		fpsLimit: DEFAULT_CONFIG.fpsLimit || 60,
		emitterPosition: { x: (DEFAULT_CONFIG.emitterPosition.x * 2) - 1, y: (DEFAULT_CONFIG.emitterPosition.y * 2) - 1 },
		emitterSize: { ...DEFAULT_CONFIG.emitterSize },
		emitterShape: DEFAULT_CONFIG.emitterShape || "rectangle",
		emitterFill: DEFAULT_CONFIG.emitterFill || "fill",
		emitterAngle: DEFAULT_CONFIG.emitterAngle,
		emitterDirection: { x: 1, y: 0 }, // Will be updated by Sync logic below
		emitterSpread: DEFAULT_CONFIG.emitterSpread,
		particleShape: DEFAULT_CONFIG.particleShape,
		particleImage: DEFAULT_CONFIG.particleImage || "",
		scaleMode: DEFAULT_CONFIG.scaleMode,
		scaleGradient: null,
		colorMode: "variable",
		colorConstant: { r: 255, g: 0, b: 0 },
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
		rotationMode: DEFAULT_CONFIG.rotationMode,
		rotationConstant: DEFAULT_CONFIG.rotationConstant,
		rotationRandom: { ...DEFAULT_CONFIG.rotationRandom },
		rotationGradient: null,
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
pane.registerPlugin(EssentialsPlugin);

let particleSystem; // Shared system instance
const blades = {}; // Store blade references
let isLoadingPreset = false; // Prevent logic during programmatic loading

// Mapping helper for single properties
const mapToLibrary = (key, val) => {
	if (key === "emitterPosition") {
		return { x: (val.x + 1) / 2, y: (val.y + 1) / 2 };
	}
	if (key === "colorGradient" || key === "opacityGradient" || key === "scaleGradient" || key === "rotationGradient" || key === "speedGradient") {
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
	enableTouchDeleteForGradient(blade);
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

const LOAD_JSON_KEY = "LOAD_JSON_ACTION";
const buildPresetOptions = (extra = {}) => ({
	"Load from JSON...": LOAD_JSON_KEY,
	...extra,
	...presets
});

// Hidden file input for loading JSON
const fileInput = document.createElement("input");
fileInput.type = "file";
fileInput.accept = ".json";
fileInput.style.display = "none";
document.body.appendChild(fileInput);

const loadExternalPreset = (data) => {
	let config = data;
	
	// Handle full export (includes canvas) vs partial (just particles)
	if (data.particleSystem) {
		config = data.particleSystem;
		if (data.canvas) {
			if (data.canvas.size) Object.assign(PARAMS.canvas.size, data.canvas.size);
			if (data.canvas.backgroundColor) PARAMS.canvas.backgroundColor = data.canvas.backgroundColor;
			updateCanvas();
		}
	}

	// Add "Unsaved preset" and reload blade
	presetBlade.dispose();
	
	const options = buildPresetOptions({ "Unsaved preset": config });

	// Capture the current first child (which will be the one after our new blade)
	const nextBlade = particlesFolder.children[0];

	presetBlade = particlesFolder.addBlade({
		view: "list",
		label: "Preset",
		options: options,
		value: config,
	});
	
	// Move blade to top (before the previously first child)
	if (nextBlade) {
		const container = nextBlade.element.parentNode;
		remCl(nextBlade.element,"tp-v-fst");
		addCl(nextBlade.element,"tp-v-lst");
		addCl(presetBlade.element,"tp-v-fst");
		container.insertBefore(presetBlade.element, nextBlade.element);
	}

	presetBlade.on("change", handlePresetChange);

	// Apply the particle config
	applyPreset(config);
};

fileInput.addEventListener("change", (e) => {
	const file = e.target.files[0];
	if (file) {
		const reader = new FileReader();
		reader.onload = (ev) => {
			try {
				const json = JSON.parse(ev.target.result);
				loadExternalPreset(json);
			} catch (err) {
				console.error(err);
				alert("Failed to load JSON preset.");
			}
		};
		reader.readAsText(file);
	}
	fileInput.value = "";
});

// Drag and drop support
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => {
	e.preventDefault();
	if (!e.dataTransfer.files.length) return;
	const file = e.dataTransfer.files[0];
	if (!file.name.toLowerCase().endsWith(".json")) return;
	const reader = new FileReader();
	reader.onload = (ev) => {
		try {
			const json = JSON.parse(ev.target.result);
			loadExternalPreset(json);
		} catch (err) {
			console.error(err);
			alert("Failed to load JSON preset.");
		}
	};
	reader.readAsText(file);
});

const applyPreset = (preset) => {
	if (!preset) return;
	isLoadingPreset = true;

	// Reset to defaults first to ensure properties not in the preset are cleared
	const defaultsUI = libraryToUI(DEFAULT_CONFIG);
	const applyData = (data) => {
		Object.keys(data).forEach(key => {
			if (key === "colorGradient" || key === "opacityGradient" || key === "scaleGradient" || key === "rotationGradient" || key === "speedGradient") {
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
	updateGradientBlade("rotationGradient", uiData.rotationGradient);
	updateGradientBlade("speedGradient", uiData.speedGradient);

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
	updateSpeedVisibility(PARAMS.particleSystem.speedMode);
	updateSwayVisibility(PARAMS.particleSystem.swayType);
	updateInteractionVisibility(PARAMS.particleSystem.interactionType);
	updateRotationVisibility(PARAMS.particleSystem.rotationMode);
	updateColorVisibility(PARAMS.particleSystem.colorMode);
	imageBinding.hidden = PARAMS.particleSystem.particleShape !== "image";
	updateExportVisibility();

	refreshPreview();
	isLoadingPreset = false;
};

const handlePresetChange = (ev) => {
	if (ev.value === LOAD_JSON_KEY) {
		fileInput.click();
		return;
	}
	applyPreset(ev.value);
};

let presetBlade = particlesFolder.addBlade({
	view: "list",
	label: "Preset",
	options: buildPresetOptions(),
	value: presets.Default,
});

presetBlade.on("change", handlePresetChange);

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
	updateExportVisibility();
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

		const img = new Image();
		img.onload = () => {
			let w = img.width;
			let h = img.height;
			if (w >= 256 || h >= 256) {
				const scale = Math.min(256 / w, 256 / h);
				w = Math.max(1, Math.round(w * scale));
				h = Math.max(1, Math.round(h * scale));
			}
			PARAMS.particleSystem.particleDimensions.x = w;
			PARAMS.particleSystem.particleDimensions.y = h;
			pane.refresh();
			particleSystem.updateConfig({ particleDimensions: { x: w, y: h } });
		};
		img.src = url;
	} else {
		particleSystem.updateConfig({ particleImage: null });
	}
	updateExportVisibility();
});
imageBinding.hidden = PARAMS.particleSystem.particleShape !== "image";

bindParticle(shapeFolder, "particleDimensions", {
	x: { min: 1, max: 1000, step: 1 },
	y: { min: 1, max: 1000, step: 1 },
	label: "Dimensions (W/H)"
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
	} else if (val === "variable") {
		newPts = [
			{ time: 0, value: { r: 255, g: 255, b: 255, a: 1 } },
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

const scaleRandomBinding = bindParticle(shapeFolder, "scaleRandom", {
	min: 1, max: 100, step: 1, label: "Scale Range (%)"
}, (val) => {
	if (isLoadingPreset) return;
	particleSystem.updateConfig({ scaleRandom: val });
});

const scaleGradientBlade = bindGradient(shapeFolder, "scaleGradient", "Scale Gradient", [
	{ time: 0, value: { r: 255, g: 255, b: 255, a: DEFAULT_CONFIG.particleSize / 100 } },
	{ time: 1, value: { r: 255, g: 255, b: 255, a: DEFAULT_CONFIG.particleSize / 100 } },
], false, true);

function updateScaleVisibility(val) {
	const isConstant = val === "constant";
	const isVariable = val === "variable";
	scaleConstantBinding.hidden = !isConstant;
	scaleRandomBinding.hidden = !isVariable;
	blades.scaleGradient.hidden = !isVariable;
}
updateScaleVisibility(PARAMS.particleSystem.scaleMode);


// --- Rotation ---
const rotationModeBinding = bindParticle(shapeFolder, "rotationMode", {
	options: {
		"Constant": "constant",
		"Variable": "variable",
	},
	label: "Rotation Mode"
}, (val) => {
	if (isLoadingPreset) return;

	const currentDeg = PARAMS.particleSystem.rotationConstant;
	const currentRad = currentDeg * (Math.PI / 180);
	let newPts = [];
	if (val === "constant") {
		newPts = [
			{ time: 0, value: { r: 255, g: 255, b: 255, a: currentRad / (Math.PI * 2) } },
			{ time: 1, value: { r: 255, g: 255, b: 255, a: currentRad / (Math.PI * 2) } }
		];
	} else if (val === "variable") {
		newPts = [
			{ time: 0, value: { r: 255, g: 255, b: 255, a: 0 } },
			{ time: 1, value: { r: 255, g: 255, b: 255, a: 1 } }
		];
	}

	const blade = blades.rotationGradient;
	if (blade) {
		PARAMS.particleSystem.rotationGradient = updateGradientBladeValue(blade, newPts, debugging);
	}

	particleSystem.updateConfig({
		rotationMode: val,
		rotationGradient: mapToLibrary("rotationGradient", PARAMS.particleSystem.rotationGradient)
	});
	updateRotationVisibility(val);
});

const rotationConstantBinding = bindParticle(shapeFolder, "rotationConstant", {
	min: 0, max: 360, step: 1, label: "Rotation (°)"
}, (val) => {
	if (isLoadingPreset) return;

	const rad = val * (Math.PI / 180);
	const norm = rad / (Math.PI * 2);
	const pts = [
		{ time: 0, value: { r: 255, g: 255, b: 255, a: norm } },
		{ time: 1, value: { r: 255, g: 255, b: 255, a: norm } }
	];

	const blade = blades.rotationGradient;
	if (blade) {
		PARAMS.particleSystem.rotationGradient = updateGradientBladeValue(blade, pts, debugging);
	}

	particleSystem.updateConfig({
		rotationConstant: val,
		rotationGradient: mapToLibrary("rotationGradient", PARAMS.particleSystem.rotationGradient)
	});
});

const rotationRandomBinding = bindParticle(shapeFolder, "rotationRandom", {
	min: 0, max: 360, step: 1, label: "Rotation Range (°)"
}, (val) => {
	if (isLoadingPreset) return;
	particleSystem.updateConfig({ rotationRandom: val });
});

const rotationGradientBlade = bindGradient(shapeFolder, "rotationGradient", "Rotation Gradient", [
	{ time: 0, value: { r: 255, g: 255, b: 255, a: DEFAULT_CONFIG.rotationConstant / 360 } },
	{ time: 1, value: { r: 255, g: 255, b: 255, a: DEFAULT_CONFIG.rotationConstant / 360 } },
], false, true);

function updateRotationVisibility(val) {
	const isConstant = val === "constant";
	const isVariable = val === "variable";
	rotationConstantBinding.hidden = !isConstant;
	rotationRandomBinding.hidden = !isVariable;
	blades.rotationGradient.hidden = !isVariable;
}
updateRotationVisibility(PARAMS.particleSystem.rotationMode);


const lifetimeFolder = particlesFolder.addFolder({ title: "Lifetime & Motion" });
bindParticle(lifetimeFolder, "particleLife", { min: 0.1, max: 10.0, step: 0.1, label: "Lifetime (s)" });

const speedModeBinding = bindParticle(lifetimeFolder, "speedMode", {
	options: {
		"Constant": "constant",
		"Variable": "variable",
	},
	label: "Speed Mode"
}, (val) => {
	if (isLoadingPreset) return;

	let newPts = [];
	if (val === "constant") {
		newPts = [
			{ time: 0, value: { r: 255, g: 255, b: 255, a: 1 } },
			{ time: 1, value: { r: 255, g: 255, b: 255, a: 1 } }
		];
	} else if (val === "variable") {
		newPts = [
			{ time: 0, value: { r: 255, g: 255, b: 255, a: 0 } },
			{ time: 1, value: { r: 255, g: 255, b: 255, a: 1 } }
		];
	}

	const blade = blades.speedGradient;
	if (blade) {
		PARAMS.particleSystem.speedGradient = updateGradientBladeValue(blade, newPts, debugging);
	}

	particleSystem.updateConfig({ 
		speedMode: val,
		speedGradient: mapToLibrary("speedGradient", PARAMS.particleSystem.speedGradient)
	});
	updateSpeedVisibility(val);
});

const speedConstantBinding = bindParticle(lifetimeFolder, "particleSpeed", { min: 0, max: 1000, step: 1, label: "Speed" });
const speedRandomBinding = bindParticle(lifetimeFolder, "speedRandom", {
	min: 0, max: 1000, step: 1, label: "Speed Range"
}, (val) => {
	if (isLoadingPreset) return;
	particleSystem.updateConfig({ speedRandom: val });
});

const speedGradientBlade = bindGradient(lifetimeFolder, "speedGradient", "Speed Gradient", [
	{ time: 0, value: { r: 255, g: 255, b: 255, a: 1 } },
	{ time: 1, value: { r: 255, g: 255, b: 255, a: 1 } },
], false, true);

function updateSpeedVisibility(val) {
	const isConstant = val === "constant";
	speedConstantBinding.hidden = !isConstant;
	speedRandomBinding.hidden = isConstant;
	blades.speedGradient.hidden = isConstant;
}
updateSpeedVisibility(PARAMS.particleSystem.speedMode);

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

const colorModeBinding = bindParticle(particlesFolder, "colorMode", {
	options: {
		"Constant": "constant",
		"Variable": "variable",
		"Random": "random",
	},
	label: "Color Mode"
}, (val) => {
	if (isLoadingPreset) return;
	
	let newPts = [];
	if (val === "constant") {
		const c = PARAMS.particleSystem.colorConstant;
		newPts = [
			{ time: 0, value: { r: c.r, g: c.g, b: c.b, a: 1 } },
			{ time: 1, value: { r: c.r, g: c.g, b: c.b, a: 1 } }
		];
	} else if (val === "variable") {
		newPts = [
			{ time: 0, value: { r: 255, g: 0, b: 0, a: 1 } },
			{ time: 1, value: { r: 0, g: 0, b: 255, a: 1 } },
		];
	} else if (val === "random") {
		newPts = [
			{ time: 0, value: { r: 255, g: 0, b: 0, a: 1 } },
			{ time: 0.16, value: { r: 255, g: 255, b: 0, a: 1 } },
			{ time: 0.33, value: { r: 0, g: 255, b: 0, a: 1 } },
			{ time: 0.5, value: { r: 0, g: 255, b: 255, a: 1 } },
			{ time: 0.66, value: { r: 0, g: 0, b: 255, a: 1 } },
			{ time: 0.83, value: { r: 255, g: 0, b: 255, a: 1 } },
			{ time: 1, value: { r: 255, g: 0, b: 0, a: 1 } }
		];
	}

	const blade = blades.colorGradient;
	if (blade && newPts.length > 0) {
		PARAMS.particleSystem.colorGradient = updateGradientBladeValue(blade, newPts, debugging);
	}

	particleSystem.updateConfig({ 
		randomColor: val === "random",
		colorGradient: mapToLibrary("colorGradient", PARAMS.particleSystem.colorGradient)
	});
	updateColorVisibility(val);
});

const colorConstantBinding = bindParticle(particlesFolder, "colorConstant", {
	view: "color",
	label: "Color",
}, (val) => {
	if (isLoadingPreset) return;
	// Update gradient to flat
	const points = [
		{ time: 0, value: { r: val.r, g: val.g, b: val.b, a: 1 } },
		{ time: 1, value: { r: val.r, g: val.g, b: val.b, a: 1 } }
	];
	if (blades.colorGradient) {
		PARAMS.particleSystem.colorGradient = updateGradientBladeValue(blades.colorGradient, points, debugging);
	} else {
		PARAMS.particleSystem.colorGradient = points;
	}
	particleSystem.updateConfig({ colorGradient: mapToLibrary("colorGradient", PARAMS.particleSystem.colorGradient) });
});

bindGradient(particlesFolder, "colorGradient", "Color", [
	{ time: 0, value: { r: 255, g: 0, b: 0, a: 1 } },
	{ time: 1, value: { r: 0, g: 0, b: 255, a: 1 } },
]);

const updateColorVisibility = (mode) => {
	colorConstantBinding.hidden = mode !== "constant";
	blades.colorGradient.hidden = mode === "constant";
};
updateColorVisibility(PARAMS.particleSystem.colorMode);
const emitterFolder = pane.addFolder({ title: "Emitter" });

bindParticle(emitterFolder, "emissionRate", { min: 1, max: 10000, step: 5, label: "Emission Rate" });

const emitterPosBinding = bindParticle(emitterFolder, "emitterPosition", {	x: { min: -1, max: 1, step: 0.01 },
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

bindParticle(emitterFolder, "emitterShape", {
	options: {
		"Rectangle": "rectangle",
		"Circle": "circle",
	},
	label: "Shape"
});

bindParticle(emitterFolder, "emitterFill", {
	options: {
		"Fill": "fill",
		"Rim": "rim",
	},
	label: "Fill"
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
	includeImage: false,
	imageFormat: "zip",
};
exportFolder.addBinding(exportParams, "format", {
	options: {
		JSON: "json",
		"HTML bundle (ZIP)": "html",
	},
	label: "Format"
}).on("change", () => updateExportVisibility());

const includeImageBinding = exportFolder.addBinding(exportParams, "includeImage", {
	label: "Include image"
});
includeImageBinding.on("change", () => updateExportVisibility());

const imageFormatBinding = exportFolder.addBinding(exportParams, "imageFormat", {
	options: {
		"Separate file (ZIP)": "zip",
		"Base64 (in JSON)": "base64",
	},
	label: "Image encoding"
});

const updateExportVisibility = () => {
	const img = PARAMS.particleSystem.particleImage;
	const hasImage = PARAMS.particleSystem.particleShape === "image"
		&& (img instanceof File || (typeof img === "string" && img !== ""));
	const isJson = exportParams.format === "json";
	includeImageBinding.hidden = !(isJson && hasImage);
	imageFormatBinding.hidden = !(isJson && hasImage && exportParams.includeImage);
	if (!hasImage && exportParams.includeImage) {
		exportParams.includeImage = false;
		includeImageBinding.refresh();
	}
};
updateExportVisibility();

const exportButton = exportFolder.addButton({ title: "Export" });
exportButton.on("click", async () => {
	if (exportParams.format === "json" && exportParams.includeImage) {
		if (exportParams.imageFormat === "base64") {
			await exportJSONBase64(PARAMS);
			return;
		}
		await exportJSONZip(PARAMS);
		return;
	}
	if (exportParams.format === "json") {
		exportJSON(PARAMS);
		return;
	}
	await exportHTML(PARAMS);
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
	addCl(controlsPanel,"collapsed");
	remCl(toggleControlsButton,"hidden");
	refreshLayout();
}

function resizePanel(e) {
	if (!panelIsResizing) return;
	
	let newWidth = e.clientX;
	
	if (newWidth < COLLAPSED_PANEL_WIDTH) {
		collapsePanel();
		return;
	}
	
	remCl(controlsPanel,"collapsed");
	addCl(toggleControlsButton,"hidden");
	
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
	remCl(controlsPanel,"collapsed");
	controlsPanel.style.width = `${DEFAULT_PANEL_WIDTH}px`; // Restore to last known width
	addCl(toggleControlsButton,"hidden");
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
