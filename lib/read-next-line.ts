import { Readable } from 'node:stream';
import { ReadableStream, type ReadableStreamDefaultReader } from 'node:stream/web';
import { LineSplitter } from './LineSplitter.js';

export { LineSplitter } from './LineSplitter.js';

export class ReadNextLine {
	private readonly reader: ReadableStreamDefaultReader<string>;
	private done = false;

	constructor(stream: ReadableStream<Uint8Array> | Readable) {
		let webStream: ReadableStream<Uint8Array>;
		if (stream instanceof ReadableStream) {
			webStream = stream;
		} else if (stream && typeof stream.pipe === 'function' && typeof stream.on === 'function') {
			// Isolate readable EOF from a Duplex's writable lifecycle.
			const readable = Readable.from(stream.iterator({ destroyOnReturn: false }), {
				objectMode: stream.readableObjectMode,
				highWaterMark: stream.readableHighWaterMark
			});
			// The iterator does not attach its error handler until reading begins.
			const onSourceError = (error: Error) => readable.destroy(error);
			stream.on('error', onSourceError);
			readable.once('close', () => stream.off('error', onSourceError));
			webStream = Readable.toWeb(readable, {
				strategy: {
					highWaterMark: stream.readableHighWaterMark,
					// Strategy support requires Node.js 18.7.0 or later; count binary chunks in bytes.
					size: (chunk: Uint8Array) => (stream.readableObjectMode ? 1 : chunk.byteLength)
				}
			});
		} else {
			throw new TypeError('Unsupported stream');
		}
		this.reader = webStream.pipeThrough(new LineSplitter()).getReader();
	}

	/**
	 * Reads the next line from the stream.
	 * If there are no more lines and the stream is done, returns null.
	 */
	public async readLine(): Promise<string | null> {
		if (this.done) {
			return null;
		}
		const result = await this.reader.read();
		this.done = result.done;
		return result.value ?? null;
	}

	/**
	 * Releases the lock on the internal reader without cancelling the source stream.
	 */
	public release(): void {
		this.reader.releaseLock();
	}
}
