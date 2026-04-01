const debugging = process.env.DEBUG == "true";

// Registry of all inner ComplexValues being tracked for the override.
// Populated by enableTextOverride; consumed by withConstraintsBypass.
const constraintRegistry = new Map(); // inner ComplexValue → original constraint

/**
 * Temporarily nulls all tracked constraints, calls fn(), then restores them.
 * Use around pane.refresh() when loading preset values that may exceed control ranges.
 */
export function withConstraintsBypass(fn) {
	constraintRegistry.forEach((constraint, inner) => { inner.constraint_ = null; });
	try { fn(); } finally {
		constraintRegistry.forEach((constraint, inner) => { inner.constraint_ = constraint; });
	}
}

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

export function enableTouchDeleteForGradient(blade) {
	const el = blade.element;
	if (!el) return;

	let lastTapId = null, lastTapTime = 0;
	const DOUBLE_TAP_DELAY = 300;

	el.addEventListener("pointerdown", (e) => {
		if (e.pointerType !== "touch") return;

		const marker = e.target.closest(".tp-gradient-range__marker");
		const pointId = marker?.dataset.id;
		if (!pointId) return;

		const now = Date.now();
		if (lastTapId === pointId && now - lastTapTime < DOUBLE_TAP_DELAY) {
			e.preventDefault();
			lastTapId = null;
			lastTapTime = 0;
			marker.dispatchEvent(new MouseEvent("mouseup", { button: 2, bubbles: true }));
		} else {
			lastTapId = pointId;
			lastTapTime = now;
		}
	});
}

export function enableTextOverride(binding) {
	const bc = binding.controller;
	if (!bc) return;
	const vc = bc.valueController;
	if (!vc) return;

	// vc.value is an InputBindingValue wrapping a ComplexValue in .value_
	// Sub-axis values (Point2d/Interval) are plain ComplexValues.
	// The constraint lives on the ComplexValue, not the InputBindingValue wrapper.
	const innerOf = (val) => val.value_ ?? val;

	const allValues = new Set();
	allValues.add(vc.value);

	const ntcs = [];

	if (typeof vc.constrainValue_ === "function" && vc.view?.inputElement) {
		// Direct NumberTextController (number without slider)
		ntcs.push(vc);
	} else if (vc.textController) {
		const tc = vc.textController;
		if (typeof tc.constrainValue_ === "function" && tc.view?.inputElement) {
			// SliderTextController → NumberTextController
			ntcs.push(tc);
		} else if (tc.textControllers) {
			// PointNdTextController (Point2d, Interval/range, etc.)
			tc.textControllers.forEach(subTc => {
				ntcs.push(subTc);
				allValues.add(subTc.value);
			});
		}
	}

	if (ntcs.length === 0) return;

	// Save the original constraints once at setup time.
	const savedConstraints = new Map();
	allValues.forEach(val => {
		const inner = innerOf(val);
		savedConstraints.set(inner, inner.constraint_);
		constraintRegistry.set(inner, inner.constraint_);
	});

	ntcs.forEach(ntc => {
		// Permanently replace constrainValue_ on the instance with a flag-gated version.
		// Mouse drags and keyboard steps call it with the flag unset → normal clamping.
		// The capture listener below sets the flag → text input bypasses clamping.
		const origConstrainValue = ntc.constrainValue_.bind(ntc);
		ntc.constrainValue_ = function(v) {
			if (ntc._textOverrideActive) return v;
			return origConstrainValue(v);
		};

		// Capture-phase listener fires BEFORE Tweakpane's bubble-phase onInputChange_.
		ntc.view.inputElement.addEventListener("change", () => {
			ntc._textOverrideActive = true;
			// Null the constraint on the inner ComplexValue so setRawValue doesn't clamp.
			allValues.forEach(val => { innerOf(val).constraint_ = null; });

			setTimeout(() => {
				ntc._textOverrideActive = false;
				savedConstraints.forEach((c, inner) => { inner.constraint_ = c; });
			}, 0);
		}, { capture: true });
	});
}

export function patchPaneForTextOverride(paneOrFolder) {
	const origAddBinding = paneOrFolder.addBinding.bind(paneOrFolder);
	paneOrFolder.addBinding = function (...args) {
		const binding = origAddBinding(...args);
		const options = args[2] || {};
		if (options.view !== "color") {
			enableTextOverride(binding);
		}
		return binding;
	};

	const origAddFolder = paneOrFolder.addFolder.bind(paneOrFolder);
	paneOrFolder.addFolder = function (...args) {
		const folder = origAddFolder(...args);
		patchPaneForTextOverride(folder);
		return folder;
	};
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
