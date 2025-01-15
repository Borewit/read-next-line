// CommonJS mode entry point

class ReadNextLine  {

	#stream;
	#readLine;

	constructor(stream) {
		this.#stream = stream;
	}

	async readLine() {
		if(!this.#readLine) {
			const {ReadNextLine} = await import('./read-next-line.js');
			this.#readLine = new ReadNextLine(this.#stream);
		}
		return this.#readLine.readLine();
	}
}

module.exports = {ReadNextLine}
