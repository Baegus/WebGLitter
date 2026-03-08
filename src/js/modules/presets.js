export const presets = {
	"Default": {
		emissionRate: 5000,
		particleLife: 2.0,
		particleSpeed: 100.0,
		particleSize: 10.0,
		particleDimensions: { x: 100, y: 100 },
		emitterPosition: { x: 0.5, y: 0.5 },
		emitterSize: { x: 0, y: 0 },
		emitterAngle: 0,
		emitterSpread: 360,
		particleShape: "softCircle",
		interactionType: "none",
		gravity: { x: 0, y: 0 },
		blendMode: "additive",
		swayType: "none",
		swayAmount: 20,
		swayFrequency: 2.0,
		colorGradient: [
			{ time: 0, value: [255, 0, 0, 1] },
			{ time: 1, value: [0, 0, 255, 1] }
		],
		opacityGradient: [
			{ time: 0, value: [255, 255, 255, 1] },
			{ time: 1, value: [255, 255, 255, 0] }
		],
	},
	"Fire": {
		"emissionRate": 845,
		"particleLife": 1.4,
		"particleSpeed": 171,
		"particleSize": 66,
		"particleDimensions": {
			"x": 100,
			"y": 100
		},
		"fpsLimit": 60,
		"emitterPosition": {
			"x": 0.5,
			"y": 0.865
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
			{
				"time": 0,
				"value": [
					0,
					81.6796875,
					255,
					1
				]
			},
			{
				"time": 0.2313,
				"value": [
					251.8125,
					172.78431143760682,
					5.090350341796896,
					1
				]
			},
			{
				"time": 0.37510000000000004,
				"value": [
					255,
					0,
					0,
					1
				]
			},
			{
				"time": 0.7244,
				"value": [
					57.375,
					57.375,
					57.375,
					1
				]
			}
		],
		"opacityGradient": [
			{
				"time": 0,
				"value": [
					255,
					255,
					255,
					1
				]
			},
			{
				"time": 1,
				"value": [
					255,
					255,
					255,
					0
				]
			}
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
		"swayFrequency": 1.8
	},
};
