import { spawn } from "child_process";

function startParcel() {
	const debugging = process.argv.includes("--debug");
	if (debugging) {
		process.env.DEBUG = "true";
	}
	
	console.log(`Starting Parcel bundler${debugging?" with debugging enabled":""}...`);
	
	const parcel = spawn("parcel", ["--no-cache", "--config", "./parcel/.parcel.dev"], {
		stdio: "inherit",
		shell: true
	});
	
	parcel.on("exit", (code, signal) => {
		if (code === 0 || signal === "SIGINT") return;
		console.error(`Parcel exited with code ${code}. Restarting...`);
		setTimeout(startParcel, 1);
	});
}

startParcel();