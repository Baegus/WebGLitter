export const DEFAULT_CONFIG = {
	maxParticles: 100000,
	emissionRate: 5000,
	particleLife: 2.0,
	particleSpeed: 100.0,
	particleSize: 50.0,
	particleDimensions: { x: 32, y: 32 },
	fpsLimit: 60,
	emitterPosition: { x: 0.5, y: 0.5 },
	emitterSize: { x: 0, y: 0 },
	emitterAngle: 0,
	emitterSpread: 360,
	particleShape: "softCircle",
	particleImage: "",
	interactionType: "none",
	repelRadius: 100.0,
	repelStrength: 500.0,
	gravity: { x: 0, y: 0 },
	blendMode: "additive",
	swayType: "none",
	swayAmount: 20,
	swayFrequency: 2.0,
	scaleMode: "constant",
	scaleRandom: { min: 28, max: 60 },
	scaleGradient: [
		{ time: 0, value: [255, 255, 255, 0.6] },
		{ time: 1, value: [255, 255, 255, 0.6] }
	],
	rotationMode: "constant",
	rotationConstant: 0,
	rotationRandom: { min: 0, max: 360 },
	rotationGradient: [
		{ time: 0, value: [255, 255, 255, 0] },
		{ time: 1, value: [255, 255, 255, 1] }
	],
	colorGradient: [
		{ time: 0, value: [255, 0, 0, 1] },
		{ time: 1, value: [0, 0, 255, 1] }
	],
	opacityGradient: [
		{ time: 0, value: [255, 255, 255, 1] },
		{ time: 1, value: [255, 255, 255, 0] }
	],
};

export const presets = {
	"Default": DEFAULT_CONFIG,
	"Flame Under Pointer": {
		"emissionRate": 845,
		"particleLife": 1.4,
		"particleSpeed": 171,
		"particleSize": 66,
		"scaleMode": "variable",
		"scaleGradient": [
			{ "time": 0, "value": [255, 255, 255, 0.66] },
			{ "time": 1, "value": [255, 255, 255, 0] }
		],
		"scaleRandom": {
			"min": 28,
			"max": 60
		},
		"particleDimensions": {
			"x": 100,
			"y": 100
		},
		"fpsLimit": 60,
		"emitterPosition": {
			"x": 0.5,
			"y": 0.86
		},
		"emitterSize": {
			"x": 0.07,
			"y": 0
		},
		"emitterAngle": -90,
		"emitterSpread": 0,
		"particleShape": "softCircle",
		"particleImage": "",
		"colorGradient": [
			{ "time": 0, "value": [0, 81.7, 255, 1] },
			{ "time": 0.23, "value": [210, 163, 63.4, 1] },
			{ "time": 0.37, "value": [204, 85.4, 64, 1] },
			{ "time": 0.72, "value": [57.38, 57.38, 57.38, 1] }
		],
		"opacityGradient": [
			{ "time": 0, "value": [255, 255, 255, 1] },
			{ "time": 1, "value": [255, 255, 255, 0] }
		],
		"interactionType": "follow",
		"repelRadius": 100,
		"repelStrength": 500,
		"gravity": {
			"x": 0,
			"y": 0
		},
		"blendMode": "additive",
		"swayType": "circular",
		"swayAmount": 15,
		"swayFrequency": 1.8,
		"maxParticles": 100000
	},
};
