import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { ReadableStream } from 'node:stream/web';
import { ReadNextLine } from '../lib/read-next-line.js';
import { createStreamFromString } from './util.ts';

describe('ReadNextLine stream lifecycle', () => {
	it('should apply backpressure to an unread Node.js stream', async () => {
		let produced = 0;
		const encoder = new TextEncoder();
		const source = Readable.from(
			(function* () {
				for (let index = 0; index < 100; ++index) {
					++produced;
					yield encoder.encode(`line ${index}\n`);
				}
			})(),
			{ highWaterMark: 1 }
		);
		const reader = new ReadNextLine(source);
		try {
			await new Promise<void>(resolve => setImmediate(resolve));
			expect(produced).toBeLessThan(100);
			expect(source.readableEnded).toBe(false);
			for (let index = 0; index < 100; ++index) {
				expect(await reader.readLine()).toBe(`line ${index}`);
			}
			expect(await reader.readLine()).toBeNull();
		} finally {
			reader.release();
			source.destroy();
		}
	});

	it('should propagate Node.js stream errors', async () => {
		const failure = new Error('Node.js source failed');
		const source = new Readable({
			read() {
				this.destroy(failure);
			}
		});
		const reader = new ReadNextLine(source);
		try {
			await expect(reader.readLine()).rejects.toBe(failure);
		} finally {
			reader.release();
		}
	});

	it('should accept Node.js-compatible streams without requiring the same prototype', async () => {
		const source = new Proxy(Readable.from([new TextEncoder().encode('line\n')]), {
			getPrototypeOf() {
				return Object.prototype;
			}
		});
		expect(source).not.toBeInstanceOf(Readable);
		const reader = new ReadNextLine(source);
		try {
			expect(await reader.readLine()).toBe('line');
			expect(await reader.readLine()).toBeNull();
		} finally {
			reader.release();
		}
	});

	it('should propagate Web stream errors', async () => {
		const failure = new Error('Web source failed');
		const reader = new ReadNextLine(
			new ReadableStream<Uint8Array>({
				start(controller) {
					controller.error(failure);
				}
			})
		);
		try {
			await expect(reader.readLine()).rejects.toBe(failure);
		} finally {
			reader.release();
		}
	});

	it('should reject when a Node.js stream closes prematurely', async () => {
		const source = new Readable({
			read() {
				this.destroy();
			}
		});
		const reader = new ReadNextLine(source);
		try {
			await expect(reader.readLine()).rejects.toMatchObject({ name: 'AbortError' });
		} finally {
			reader.release();
		}
	}, 1000);

	it('should handle an already-ended Node.js stream', async () => {
		const source = Readable.from([]);
		source.resume();
		await finished(source);
		const reader = new ReadNextLine(source);
		try {
			expect(await reader.readLine()).toBeNull();
		} finally {
			reader.release();
		}
	}, 1000);

	it('should settle reads from an already-destroyed Node.js stream', async () => {
		const source = new Readable();
		source.destroy();
		const reader = new ReadNextLine(source);
		try {
			// Depending on the Node.js version, toWeb reports EOF or a premature-close error.
			await reader.readLine().then(
				line => {
					expect(line).toBeNull();
				},
				error => {
					expect(error).toMatchObject({ name: 'AbortError' });
				}
			);
		} finally {
			reader.release();
		}
	}, 1000);

	it('should return null repeatedly after EOF, even after releasing the lock', async () => {
		const reader = new ReadNextLine(createStreamFromString('line\n'));
		expect(await reader.readLine()).toBe('line');
		expect(await reader.readLine()).toBeNull();
		reader.release();
		expect(await reader.readLine()).toBeNull();
		expect(await reader.readLine()).toBeNull();
	});

	it('should support concurrent reads in order', async () => {
		const reader = new ReadNextLine(createStreamFromString('first\nsecond\n'));
		try {
			expect(await Promise.all([reader.readLine(), reader.readLine(), reader.readLine()])).toEqual([
				'first',
				'second',
				null
			]);
			expect(await reader.readLine()).toBeNull();
		} finally {
			reader.release();
		}
	});

	it.each([null, undefined, {}, 'not a stream', new Uint8Array()])('should reject unsupported input %j', input => {
		expect(() => new ReadNextLine(input as unknown as Readable)).toThrow(new TypeError('Unsupported stream'));
	});
});
