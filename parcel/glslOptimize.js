const { Optimizer } = require("@parcel/plugin");

module.exports = new Optimizer({
	async optimize({ bundle, contents, map }) {
		let code = contents.toString();

		// A simple regex to find WebGL shader strings.
		// Assuming shaders are defined as `#version xxx es ...`
		// We can replace comments and extra whitespace.
		
		code = code.replace(/#version (\d+) es[\s\S]*?(?=`)/g, (match) => {
			return match
				// Remove single-line comments
				.replace(/\/\/.*$/gm, '')
				// Remove multi-line comments
				.replace(/\/\*[\s\S]*?\*\//g, '')
				// Remove extra whitespace
				.replace(/\s+/g, ' ')
				// Remove whitespace around operators
				.replace(/\s*([=+\-*/<>!&|{},;])\s*/g, "$1")
				// Ensure #version 300 es has a newline after it
				.replace(/#version (\d+) es/g, "#version $1 es\n")
				// Trim
				.trim();
		});

		return {
		contents: code,
		map
		};
	}
});
