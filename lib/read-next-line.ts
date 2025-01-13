export class ReadNextLine {
	private buffer: string = '';
	private lineBuffer: string[] = [];
	private reader: ReadableStreamDefaultReader<string>;
	private readonly separator: RegExp = /\r\n|\n/;

	constructor(private stream: ReadableStream<Uint8Array>) {
		// Initialize the reader properly by decoding the stream and assigning the reader.
		this.reader = stream.pipeThrough(new TextDecoderStream()).getReader();
	}

	/**
	 * Reads the next line from the stream.
	 * If there are no more lines and the stream is done, returns null.
	 */
	public async readLine(): Promise<string | null> {
		while (this.lineBuffer.length === 0) {
			// Read the next chunk from the stream.
			const {done, value} = await this.reader.read();

			// If the stream is complete and no more data is available, return null.
			if (done) {
				// Handle any remaining buffer content before returning null.
				if (this.buffer) {
					const remainingLine = this.buffer;
					this.buffer = ''; // Clear the buffer.
					return remainingLine;
				}
				return null;
			}

			// Append the new chunk to the buffer.
			this.buffer += value;

			// Split the buffer into lines based on the separator.
			this.lineBuffer = this.buffer.split(this.separator);

			// Keep the last incomplete line in the buffer for the next read.
			this.buffer = this.lineBuffer.pop() ?? '';
		}

		// Return the next line from the line buffer.
		return this.lineBuffer.shift()!;
	}
}
