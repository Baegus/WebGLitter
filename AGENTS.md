# Project Context: WebGL 2 Particle System + Editor

The editor page (`src/js/editor.js`) is built separately from the particle library (`src/js/WebGLitter.js`). Focus on very high performance, very low resource usage (mainly CPU, but also GPU) and small code size for the lib.

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

### WebGL
- Use **WebGL 2** only.