# Project Context: WebGL 2 Particle System + Editor


## Tech Stack & Syntax Preferences
- **JavaScript:** ES6+ modules
- **Indentation:** Tabs
- **Strings:** "Double quotes" for literals, backticks for template strings
- **Variables:** `const` / `let` (no `var`); camelCase
- **Templating:** Pug
- **Styles:** SCSS
- **Flow:** Prefer early returns/breaks/continues over deep nesting
- **Debug:** Wrap logs: `if (debugging) { console.log(...) }`

## Interaction & Animation Rules

### DOM Manipulation
- Use **Pointer Events** (`pointerdown`, `pointermove`, `pointerup`) instead of Mouse/Touch.
- Save selector-queried elements in variables, do not query selectors repeatedly.

### Anime.js V4 Syntax (Strict Adherence)
The project uses **Anime.js v4**. Do not use v3 syntax.

```javascript
import { animate, createTimer } from "animejs";

// 1. Animation Syntax
animate(targetElement, {
	opacity: 0,
	y: 100, // Shorthand for translateY
	duration: 800,
	ease: "inOutQuad",
	// Callbacks
	onUpdate: (anim) => {  },
	onComplete: (anim) => {  }
});

// 2. Timer Syntax
const timer = createTimer({
	frameRate: 60,
	onUpdate: (anim) => {
		const delta = anim.deltaTime;
		// Game loop logic using delta
	}
});
```

### WebGL
- Use **WebGL 2** only.