import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Duplex, Readable } from 'node:stream';
import { ReadableStream } from 'node:stream/web';
import { test } from 'node:test';
import { LineSplitter, ReadNextLine } from 'read-next-line';

const encoder = new TextEncoder();

function createWebStream(chunks) {
	return new ReadableStream({
		start(controller) {
			for (const chunk of chunks) {
				controller.enqueue(encoder.encode(chunk));
			}
			controller.close();
		}
	});
}

async function readLines(reader) {
	const lines = [];
	let line;
	while ((line = await reader.readLine()) !== null) {
		lines.push(line);
	}
	return lines;
}

test('ESM entry point reads Web streams on supported Node.js runtimes', async () => {
	const reader = new ReadNextLine(createWebStream(['first\r', '\nsecond\nthird']));
	try {
		assert.deepEqual(await readLines(reader), ['first', 'second', 'third']);
	} finally {
		reader.release();
	}
});

test('ESM entry point reads Node.js streams on supported Node.js runtimes', async () => {
	const reader = new ReadNextLine(Readable.from(['first\r', '\nsecond\nthird'].map(chunk => encoder.encode(chunk))));
	try {
		assert.deepEqual(await readLines(reader), ['first', 'second', 'third']);
	} finally {
		reader.release();
	}
});

test('binary Node.js streams apply byte-sized backpressure', async () => {
	let produced = 0;
	const line = 'x'.repeat(1023);
	const chunk = encoder.encode(`${line}\n`);
	const source = Readable.from(
		(function* () {
			for (let index = 0; index < 100; ++index) {
				++produced;
				yield chunk;
			}
		})(),
		{ objectMode: false, highWaterMark: chunk.byteLength }
	);
	const reader = new ReadNextLine(source);
	try {
		await new Promise(resolve => setImmediate(resolve));
		assert.ok(produced < 100, 'an unread stream should not drain the entire source');
		assert.deepEqual(await readLines(reader), new Array(100).fill(line));
	} finally {
		reader.release();
		source.destroy();
	}
});

test('LineSplitter is available from the ESM entry point', async () => {
	const reader = createWebStream(['first\nsecond']).pipeThrough(new LineSplitter()).getReader();
	try {
		assert.deepEqual(await reader.read(), { done: false, value: 'first' });
		assert.deepEqual(await reader.read(), { done: false, value: 'second' });
		assert.deepEqual(await reader.read(), { done: true, value: undefined });
	} finally {
		reader.releaseLock();
	}
});

test('CommonJS entry point reads streams on supported Node.js runtimes', async () => {
	const require = createRequire(import.meta.url);
	const { ReadNextLine: CommonJSReadNextLine } = require('read-next-line');
	const reader = new CommonJSReadNextLine(createWebStream(['first\nsecond']));
	assert.deepEqual(await readLines(reader), ['first', 'second']);
	assert.equal(await reader.readLine(), null);
});

test('half-open Duplex delivers buffered trailing data without closing its writable side', {
	timeout: 2000
}, async () => {
	const source = new Duplex({
		allowHalfOpen: true,
		read() {
			// Input is buffered before adaptation.
		},
		write(_chunk, _encoding, callback) {
			callback();
		}
	});
	source.push(encoder.encode('first\ntrailing'));
	source.push(null);
	const reader = new ReadNextLine(source);
	try {
		assert.deepEqual(await readLines(reader), ['first', 'trailing']);
		assert.equal(source.writableEnded, false);
		assert.equal(source.destroyed, false);
		await new Promise((resolve, reject) =>
			source.write('still writable', error => (error ? reject(error) : resolve()))
		);
	} finally {
		source.destroy();
	}
});

test('Node.js readable errors propagate through the bridge', async () => {
	const failure = new Error('source failed');
	const source = new Readable({
		read() {
			this.destroy(failure);
		}
	});
	const reader = new ReadNextLine(source);
	try {
		await assert.rejects(reader.readLine(), error => error === failure);
	} finally {
		reader.release();
	}
});

test('source errors immediately after construction reject with the original error', async () => {
	const failure = new Error('immediate source failure');
	const source = new Readable({
		read() {
			// The source is destroyed before any data is requested.
		}
	});
	const reader = new ReadNextLine(source);
	source.destroy(failure);
	try {
		await assert.rejects(reader.readLine(), error => error === failure);
	} finally {
		reader.release();
	}
});

test('cancel forwards the reason and waits for upstream Web cancellation', async () => {
	const reason = new Error('finished reading');
	let cancelled = false;
	const reader = new ReadNextLine(
		new ReadableStream({
			async cancel(value) {
				assert.equal(value, reason);
				await new Promise(resolve => setImmediate(resolve));
				cancelled = true;
			}
		})
	);
	const pending = reader.readLine();
	await reader.cancel(reason);
	assert.ok(cancelled);
	assert.equal(await pending, null);
	assert.equal(await reader.readLine(), null);
	await reader.cancel();
	reader.release();
});

test('cancel destroys a Node.js source with a read pending', async () => {
	const source = new Readable({
		read() {
			/* Keep the source open. */
		}
	});
	const reader = new ReadNextLine(source);
	const pending = reader.readLine();
	await new Promise(resolve => setImmediate(resolve));
	await reader.cancel();
	assert.equal(await pending, null);
	assert.ok(source.destroyed);
	reader.release();
});

test('cancel destroys a Node.js source that reported an error without closing', async () => {
	const failure = new TypeError('source failed');
	const source = new Readable({
		read() {
			/* Keep the source open. */
		}
	});
	const reader = new ReadNextLine(source);
	try {
		source.emit('error', failure);
		await assert.rejects(reader.readLine(), error => error === failure);
		assert.equal(source.destroyed, false);
		await assert.rejects(reader.cancel(), error => error === failure);
		assert.equal(source.destroyed, true);
	} finally {
		reader.release();
		source.destroy();
	}
});

test('release leaves the source running', async () => {
	const source = new Readable({
		read() {
			/* Keep the source open. */
		}
	});
	const reader = new ReadNextLine(source);
	reader.release();
	await assert.rejects(reader.cancel(), TypeError);
	assert.equal(source.destroyed, false);
	source.destroy();
});

test('CommonJS exposes the shared reader and splitter synchronously', async () => {
	const api = createRequire(import.meta.url)('read-next-line');
	assert.equal(api.LineSplitter, LineSplitter);
	assert.equal(api.ReadNextLine, ReadNextLine);
	const reader = new api.ReadNextLine(createWebStream(['one\ntwo\n']));
	assert.deepEqual(await Promise.all([reader.readLine(), reader.readLine()]), ['one', 'two']);
	await reader.cancel();
	reader.release();
});

test('CommonJS release works before the first read', async () => {
	const { ReadNextLine } = createRequire(import.meta.url)('read-next-line');
	const reader = new ReadNextLine(createWebStream(['one']));
	reader.release();
	await assert.rejects(reader.readLine(), TypeError);
});

test('construction rejects a locked Web stream and succeeds after unlock', async () => {
	const source = createWebStream(['line']);
	const owner = source.getReader();
	try {
		assert.throws(() => new ReadNextLine(source), TypeError);
	} finally {
		owner.releaseLock();
	}
	const reader = new ReadNextLine(source);
	assert.deepEqual(await readLines(reader), ['line']);
	reader.release();
});

test('source error forwarding survives readable EOF until the Node.js source closes', async () => {
	const source = Readable.from([], { autoDestroy: false });
	const reader = new ReadNextLine(source);
	try {
		assert.equal(await reader.readLine(), null);
		await new Promise(resolve => setImmediate(resolve));
		assert.equal(source.destroyed, false);
		source.emit('error', new Error('late source failure'));
	} finally {
		reader.release();
		const closed = new Promise(resolve => source.once('close', resolve));
		source.destroy();
		await closed;
	}
	assert.equal(source.listenerCount('error'), 0);
});
