import type {Readable} from 'node:stream';
import {LineSplitter} from "./LineSplitter.js";

export {LineSplitter} from "./LineSplitter.js";

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

/**
 * Convert a Node.js Readable stream to a Web ReadableStream.
 *
 * @param {Readable} nodeStream - The Node.js Readable stream to convert.
 * @returns {ReadableStream} - The converted Web ReadableStream.
 */
function nodeReadableToWebReadable(nodeStream: Readable): ReadableStream<Uint8Array> {
	return new ReadableStream({
		start(controller: ReadableStreamDefaultController): void {
			// When the Node.js stream emits 'data', push the chunk to the Web ReadableStream controller
			nodeStream.on('data', (chunk) => {
				controller.enqueue(chunk);
			});

			// When the Node.js stream ends, close the Web ReadableStream
			nodeStream.on('end', () => {
				controller.close();
			});

			// If an error occurs on the Node.js stream, signal the Web ReadableStream to fail
			nodeStream.on('error', (err) => {
				controller.error(err);
			});
		},

		// Optionally implement cancel logic if the Web ReadableStream is cancelled
		cancel(): void {
			// You can handle stream cancellation here if needed
			nodeStream.destroy();
		}
	});
}

export class ReadNextLine {
	private reader: ReadableStreamDefaultReader<string>;
	private done = false;

	constructor(stream: ReadableStream<Uint8Array> | Readable) {
		// Initialize the reader properly by decoding the stream and assigning the reader.
		let webStream: ReadableStream<Uint8Array>;
		if (stream instanceof ReadableStream) {
			webStream = stream;
		} else if(typeof stream.pipe === 'function' && typeof stream.on === 'function') {
			// Convert Node.js stream in web stream
			webStream = nodeReadableToWebReadable(stream);
		} else {
			throw new Error('Unsupported stream');
		}
		const lineSplitter = new LineSplitter();
		this.reader = webStream.pipeThrough(lineSplitter).getReader();
	}

	/**
	 * Reads the next line from the stream.
	 * If there are no more lines and the stream is done, returns null.
	 */
	public async readLine(): Promise<string | null> {
		if (this.done) return null;
		const result = await this.reader.read();
		this.done = result.done;
		return result.value ?? null;
	}

	/**
	 * Release the lock on the internal reader
	 */
	public release() {
		this.reader.releaseLock();
	}
}
