const debugging = process.env.DEBUG == "true";

import { animate } from "animejs";


// DEBUG STUFF HERE:
async function loadDebug() {
	if (process.env.DEBUG !== "true") return;
	console.log("%c Debugging is ON!", "font-size: 20px; color: red;");
	
	const DEBUG = await import("./modules/debug.js");
	// DEBUG.debugTest();
}
loadDebug();