// Define common BOM signatures
const BOM_UTF_8 = new Uint8Array([0xEF, 0xBB, 0xBF]);
const BOM_UTF_16_LE = new Uint8Array([0xFF, 0xFE]);
const BOM_UTF_16_BE = new Uint8Array([0xFE, 0xFF]);

type TextEncodingType = 'utf-8' | 'utf-16le' | 'utf-16be';

function extractEncoding(uint8Array: Uint8Array): TextEncodingType | undefined {
	if (uint8Array.byteLength >= 2) {
		if (uint8Array[0] === BOM_UTF_16_LE[0] &&
			uint8Array[1] === BOM_UTF_16_LE[1]) {
			return 'utf-16le';
		} else if (uint8Array[0] === BOM_UTF_16_BE[0] &&
			uint8Array[1] === BOM_UTF_16_BE[1]) {
			return 'utf-16be';
		}
	}
	if (uint8Array.byteLength >= 3 && uint8Array[0] === BOM_UTF_8[0] &&
		uint8Array[1] === BOM_UTF_8[1] &&
		uint8Array[2] === BOM_UTF_8[2]) {
		return 'utf-8';
	}
}

export class ReadNextLine {
	private buffer: string = '';
	private lineBuffer: string[] = [];
	private reader: ReadableStreamDefaultReader<Uint8Array>;
	private readonly separator: RegExp = /\r\n|\n\r|\n/;
	private decoder?: TextDecoder;
	private textEncoding?: string;

	constructor(private stream: ReadableStream<Uint8Array>) {
		// Initialize the reader properly by decoding the stream and assigning the reader.
		this.reader = stream.getReader();
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

			if (!this.decoder) {
				this.textEncoding = extractEncoding(value as Uint8Array);
				this.decoder = new TextDecoder(this.textEncoding);
			}

			// Append the new chunk to the buffer.
			this.buffer += this.decoder.decode(value);

			// Split the buffer into lines based on the separator.
			this.lineBuffer = this.buffer.split(this.separator);

			// Keep the last incomplete line in the buffer for the next read.
			this.buffer = this.lineBuffer.pop() ?? '';
		}

		// Return the next line from the line buffer.
		return this.lineBuffer.shift()!;
	}
}
