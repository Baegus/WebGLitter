// Used to rewrite the index.html file to use relative paths for assets
const { Reporter } = require("@parcel/plugin");
const fs = require("fs");

module.exports = new Reporter({
	async report({ event, options }) {
		if (event.type !== "buildSuccess") return;
		let bundles = event.bundleGraph.getBundles();
		const pugBundles = bundles.filter(bundle => bundle.name.endsWith(".html"));
		pugBundles.forEach(bundle => {
			let pugContent = fs.readFileSync(bundle.filePath, "utf8");
			if (!pugContent.includes("_relativeroute_")) return;
			pugContent = pugContent.replace(/_relativeroute_/g, ".");
			fs.writeFileSync(bundle.filePath, pugContent);
		});
		const line = "–———————————————————–"
		const msg = `✅ SUCCESSFULLY BUILT`;
		process.stdout.write(`${line}\n${msg}\n${line}\n`);
		process.stdout.write(`✨ Built ${bundles.length} bundles in ${event.buildTime}ms!\n`);
	}
});
