// CommonJS module entry point

class ReadNextLine {
	#stream;
	#readLine;

	constructor(stream) {
		this.#stream = stream;
	}

	async readLine() {
		if (!this.#readLine) {
			// Dynamically import the ESM ReadNextLine class.
			const {ReadNextLine: ESMReadNextLine} = await import('./read-next-line.js');
			this.#readLine = new ESMReadNextLine(this.#stream);
		}
		return this.#readLine.readLine();
	}
}

module.exports = {ReadNextLine};
