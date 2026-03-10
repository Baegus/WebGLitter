const debugging = process.env.DEBUG == "true";

export function updateGradientBladeValue(blade, newPoints, debugging = false) {
	if (!blade || !newPoints) return [];

	const controller = blade.controller || blade.controller_;
	const vc = controller?.valueController;
	if (!vc) return [];

	try {
		const rc = vc._gradientRangeController;
		if (rc) {
			clearActivePointId(rc);
			clearDraggingPointId(rc);
		}
		vc._activePointId = null;
		if (typeof vc.updateDisabledState === "function") vc.updateDisabledState();
	} catch (e) {
		if (debugging) console.warn("Gradient state reset failed", e);
	}

	const gradient = blade.value;
	const clonedPoints = JSON.parse(JSON.stringify(newPoints));

	if (gradient && typeof gradient.clone === "function") {
		const newGradient = gradient.clone();
		newGradient.points = clonedPoints;
		blade.value = newGradient;
	} else {
		blade.value = { points: clonedPoints };
	}

	return blade.value.points;
}

function clearActivePointId(rc) {
	if (typeof rc.setActivePointId === "function") {
		rc.setActivePointId(null);
	} else {
		rc._activePointId = null;
		if (rc.view) rc.view.activePointId = null;
	}
}

function clearDraggingPointId(rc) {
	if (typeof rc.setDraggingPointId === "function") {
		rc.setDraggingPointId(null);
	} else {
		rc._draggingPointId = null;
		if (rc.view) rc.view.draggingPointId = null;
	}
}
