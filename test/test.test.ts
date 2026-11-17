import path from 'node:path';
import { Readable } from 'node:stream';
import { ReadableStream, type ReadableStreamDefaultController } from 'node:stream/web';
import { fileURLToPath } from 'node:url';
import { LineSplitter, ReadNextLine } from '../lib/read-next-line.js';
import { createNodeReadableStreamFromFile, createStreamFromString, createWebReadableStreamFromFile } from './util.ts';

// Convert `import.meta.url` to a file path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Partial lines across chunks', () => {
	const encodeChunks = (chunks: string[]): Uint8Array[] => {
		const encoder = new TextEncoder();
		return chunks.map(chunk => encoder.encode(chunk));
	};
	const createWebStream = (chunks: string[]) =>
		new ReadableStream<Uint8Array>({
			start(controller) {
				for (const chunk of encodeChunks(chunks)) {
					controller.enqueue(chunk);
				}
				controller.close();
			}
		});
	type LineReaderFactory = (chunks: string[]) => { readLine(): Promise<string | null>; release(): void };
	const implementations: [string, LineReaderFactory][] = [
		['ReadNextLine with Web streams', (chunks: string[]) => new ReadNextLine(createWebStream(chunks))],
		['ReadNextLine with Node.js streams', (chunks: string[]) => new ReadNextLine(Readable.from(encodeChunks(chunks)))],
		[
			'LineSplitter',
			(chunks: string[]) => {
				const reader = createWebStream(chunks).pipeThrough(new LineSplitter()).getReader();
				return {
					async readLine() {
						const { done, value } = await reader.read();
						return done ? null : value;
					},
					release() {
						reader.releaseLock();
					}
				};
			}
		]
	];
	const cases: [string, string[], string[]][] = [
		['a line split across two chunks', ['hel', 'lo\n'], ['hello']],
		['a line split across several chunks', ['h', 'e', 'l', 'l', 'o\n'], ['hello']],
		['an unterminated final line', ['hel', 'lo'], ['hello']],
		['consumed lines followed by partial lines', ['first\nsec', 'ond\nthi', 'rd\n'], ['first', 'second', 'third']],
		['empty chunks between line fragments', ['hel', '', 'lo\n'], ['hello']],
		['CRLF split across chunks', ['a\r', '\nb\n'], ['a', 'b']],
		['LFCR split across chunks', ['a\n', '\rb\n'], ['a', 'b']]
	];

	for (const [implementation, createReader] of implementations) {
		describe(implementation, () => {
			for (const [name, chunks, expected] of cases) {
				it(`should handle ${name} without duplicating buffered text`, async () => {
					const reader = createReader(chunks);
					try {
						for (const line of expected) {
							expect(await reader.readLine()).toEqual(line);
						}
						expect(await reader.readLine()).toBeNull();
					} finally {
						reader.release();
					}
				});
			}
		});
	}
});

describe('Streaming decoder state across chunks', () => {
	it('retains the first BOM byte when the producer reuses its buffer', async () => {
		const splitter = new LineSplitter();
		const writer = splitter.writable.getWriter();
		const reader = splitter.readable.getReader();
		const line = reader.read();
		const byte = Uint8Array.of(0xff);
		await writer.write(byte);
		byte[0] = 0xfe;
		await writer.write(byte);
		await writer.write(Uint8Array.of(0x41, 0x00, 0x0a, 0x00));
		await writer.close();
		expect(await line).toEqual({ done: false, value: 'A' });
	});

	const createWebStream = (chunks: Uint8Array[]) =>
		new ReadableStream<Uint8Array>({
			start(controller) {
				for (const chunk of chunks) {
					controller.enqueue(chunk);
				}
				controller.close();
			}
		});
	type LineReaderFactory = (chunks: Uint8Array[]) => { readLine(): Promise<string | null>; release(): void };
	const implementations: [string, LineReaderFactory][] = [
		['ReadNextLine with Web streams', (chunks: Uint8Array[]) => new ReadNextLine(createWebStream(chunks))],
		['ReadNextLine with Node.js streams', (chunks: Uint8Array[]) => new ReadNextLine(Readable.from(chunks))],
		[
			'LineSplitter',
			(chunks: Uint8Array[]) => {
				const reader = createWebStream(chunks).pipeThrough(new LineSplitter()).getReader();
				return {
					async readLine() {
						const { done, value } = await reader.read();
						return done ? null : value;
					},
					release() {
						reader.releaseLock();
					}
				};
			}
		]
	];
	const cases: [string, Uint8Array[], string[]][] = [
		['a split UTF-8 two-byte sequence', [Uint8Array.from([0xc3]), Uint8Array.from([0xa9, 0x0a])], ['é']],
		[
			'a UTF-8 four-byte sequence split across several chunks',
			[Uint8Array.from([0xf0, 0x9f]), Uint8Array.from([0x98]), Uint8Array.from([0x80, 0x0a])],
			['😀']
		],
		['a split UTF-8 sequence at EOF', [Uint8Array.from([0xc3]), Uint8Array.from([0xa9])], ['é']],
		[
			'a UTF-8 BOM split across chunks',
			[Uint8Array.from([0xef]), Uint8Array.from([0xbb]), Uint8Array.from([0xbf, 0x41, 0x0a])],
			['A']
		],
		[
			'a UTF-16LE BOM split across chunks',
			[Uint8Array.from([0xff]), Uint8Array.from([0xfe, 0x41, 0x00, 0x0a, 0x00])],
			['A']
		],
		[
			'a UTF-16BE BOM split across chunks',
			[Uint8Array.from([0xfe]), Uint8Array.from([0xff, 0x00, 0x41, 0x00, 0x0a])],
			['A']
		],
		[
			'a split BOM after empty initial chunks',
			[new Uint8Array(0), Uint8Array.from([0xff]), new Uint8Array(0), Uint8Array.from([0xfe, 0x41, 0x00, 0x0a, 0x00])],
			['A']
		],
		['a short stream with a partial UTF-16 BOM', [Uint8Array.from([0xff])], ['\ufffd']],
		['a second U+FEFF after a split BOM', [Uint8Array.of(0xff), Uint8Array.of(0xfe, 0xff, 0xfe)], ['\ufeff']],
		['a false UTF-16 BOM prefix', [Uint8Array.of(0xff), Uint8Array.of(0x41)], ['\ufffdA']],
		['only empty chunks', [new Uint8Array(0), new Uint8Array(0)], []],
		[
			'a UTF-16LE code unit split across chunks',
			[Uint8Array.from([0xff, 0xfe, 0x41]), Uint8Array.from([0x00, 0x0a, 0x00])],
			['A']
		],
		[
			'a UTF-16LE surrogate pair split across chunks',
			[Uint8Array.from([0xff, 0xfe, 0x3d]), Uint8Array.from([0xd8, 0x00]), Uint8Array.from([0xde, 0x0a, 0x00])],
			['😀']
		],
		[
			'a UTF-16BE surrogate pair split across chunks',
			[Uint8Array.from([0xfe, 0xff, 0xd8]), Uint8Array.from([0x3d, 0xde, 0x00]), Uint8Array.from([0x00, 0x0a])],
			['😀']
		],
		['an incomplete UTF-8 sequence flushed at EOF', [Uint8Array.from([0x41, 0x0a, 0xc3])], ['A', '\ufffd']]
	];

	for (const [implementation, createReader] of implementations) {
		describe(implementation, () => {
			for (const [name, chunks, expected] of cases) {
				it(`should handle ${name}`, async () => {
					const reader = createReader(chunks);
					try {
						for (const line of expected) {
							expect(await reader.readLine()).toEqual(line);
						}
						expect(await reader.readLine()).toBeNull();
					} finally {
						reader.release();
					}
				});
			}
		});
	}
});

describe('ReadNextLine', () => {
	describe('Handle line endings', () => {
		it('should handle Unix line ending: LF', async () => {
			const input = 'line1\nline2\nline3\n\n';
			const stream = createStreamFromString(input);
			const reader = new ReadNextLine(stream);
			try {
				expect(await reader.readLine()).toEqual('line1');
				expect(await reader.readLine()).toEqual('line2');
				expect(await reader.readLine()).toEqual('line3');
				expect(await reader.readLine()).toEqual('');
				expect(await reader.readLine()).toBeNull();
			} finally {
				reader.release();
			}
		});

		it('should handle Windows line ending: CR LF', async () => {
			const input = 'line1\r\nline2\r\nline3\r\n\r\n';
			const stream = createStreamFromString(input);
			const reader = new ReadNextLine(stream);
			try {
				expect(await reader.readLine()).toEqual('line1');
				expect(await reader.readLine()).toEqual('line2');
				expect(await reader.readLine()).toEqual('line3');
				expect(await reader.readLine()).toEqual('');
				expect(await reader.readLine()).toBeNull();
			} finally {
				reader.release();
			}
		});

		it('should handle line ending: LF CR', async () => {
			const input = 'line1\n\rline2\n\rline3\n\r\n\r';
			const stream = createStreamFromString(input);
			const reader = new ReadNextLine(stream);
			try {
				expect(await reader.readLine()).toEqual('line1');
				expect(await reader.readLine()).toEqual('line2');
				expect(await reader.readLine()).toEqual('line3');
				expect(await reader.readLine()).toEqual('');
				expect(await reader.readLine()).toBeNull();
			} finally {
				reader.release();
			}
		});

		it('should handle a stream with an incomplete line at the end', async () => {
			const input = 'line1\nline2\nincomplete';
			const stream = createStreamFromString(input);
			const reader = new ReadNextLine(stream);
			try {
				expect(await reader.readLine()).toEqual('line1');
				expect(await reader.readLine()).toEqual('line2');
				expect(await reader.readLine()).toEqual('incomplete');
				expect(await reader.readLine()).toBeNull();
			} finally {
				reader.release();
			}
		});

		it('should emit a completed line before the source closes', async () => {
			let streamController!: ReadableStreamDefaultController<Uint8Array>;
			const stream = new ReadableStream<Uint8Array>({
				start(controller) {
					streamController = controller;
					controller.enqueue(new TextEncoder().encode('ready\n'));
				}
			});
			const reader = new ReadNextLine(stream);
			try {
				expect(await reader.readLine()).toEqual('ready');
				streamController.enqueue(new TextEncoder().encode('next\n'));
				expect(await reader.readLine()).toEqual('next');
			} finally {
				streamController.close();
				reader.release();
			}
		}, 1000);
	});

	async function countLines(stream: ReadableStream<Uint8Array> | Readable, nrOfLinex: number, startsWith: string) {
		const reader = new ReadNextLine(stream);
		try {
			let line: string | null;
			let lineCount = 0;
			while ((line = await reader.readLine()) !== null) {
				if (lineCount === 0) {
					expect(line.startsWith(startsWith)).toBe(true);
				}
				++lineCount;
			}
			expect(lineCount).toEqual(nrOfLinex);
		} finally {
			reader.release();
		}
	}

	const startsWith = 'Lorem ipsum odor amet, consectetuer adipiscing elit.';

	describe('Text encoding from Web ReadableStream', () => {
		async function countLinesFromWebStream(sample: string, nrOfLinex: number, startsWith: string) {
			const webStream = await createWebReadableStreamFromFile(path.join(__dirname, 'samples', sample));
			return countLines(webStream, nrOfLinex, startsWith);
		}

		it('should decode UTF-8', async () => {
			await countLinesFromWebStream('lorem-ipsem.utf-8.txt', 999, startsWith);
		});

		it('should decode UTF-8 with BOM', async () => {
			await countLinesFromWebStream('lorem-ipsem.utf-8-bom.txt', 999, startsWith);
		});

		it('should decode UTF-16 BE BOM', async () => {
			await countLinesFromWebStream('lorem-ipsem.utf-16-be-bom.txt', 999, startsWith);
		});

		it('should decode UTF-16 LE BOM', async () => {
			await countLinesFromWebStream('lorem-ipsem.utf-16-le-bom.txt', 999, startsWith);
		});
	});

	describe('Text encoding from Node.js Readable', () => {
		async function countLinesFromNodeStream(sample: string, nrOfLinex: number, startsWith: string) {
			const nodeReadable = await createNodeReadableStreamFromFile(path.join(__dirname, 'samples', sample));
			return countLines(nodeReadable, nrOfLinex, startsWith);
		}

		it('should decode UTF-8', async () => {
			await countLinesFromNodeStream('lorem-ipsem.utf-8.txt', 999, startsWith);
		});

		it('should decode UTF-8 with BOM', async () => {
			await countLinesFromNodeStream('lorem-ipsem.utf-8-bom.txt', 999, startsWith);
		});

		it('should decode UTF-16 BE BOM', async () => {
			await countLinesFromNodeStream('lorem-ipsem.utf-16-be-bom.txt', 999, startsWith);
		});

		it('should decode UTF-16 LE BOM', async () => {
			await countLinesFromNodeStream('lorem-ipsem.utf-16-le-bom.txt', 999, startsWith);
		});
	});

	it('should handle an empty stream', async () => {
		const input = '';
		const stream = createStreamFromString(input);
		const reader = new ReadNextLine(stream);
		try {
			expect(await reader.readLine()).toBeNull();
		} finally {
			reader.release();
		}
	});

	it('should handle a stream with a single line and no newline', async () => {
		const input = 'singleLine';
		const stream = createStreamFromString(input);
		const reader = new ReadNextLine(stream);
		try {
			expect(await reader.readLine()).toEqual('singleLine');
			expect(await reader.readLine()).toBeNull();
		} finally {
			reader.release();
		}
	});

	it('should handle a stream with multiple consecutive newlines', async () => {
		const input = 'line1\n\nline2\n\n\nline3\n';
		const stream = createStreamFromString(input);
		const reader = new ReadNextLine(stream);
		try {
			expect(await reader.readLine()).toEqual('line1');
			expect(await reader.readLine()).toEqual('');
			expect(await reader.readLine()).toEqual('line2');
			expect(await reader.readLine()).toEqual('');
			expect(await reader.readLine()).toEqual('');
			expect(await reader.readLine()).toEqual('line3');
			expect(await reader.readLine()).toBeNull();
		} finally {
			reader.release();
		}
	});
});

it('split', async () => {
	const input = 'line1\n\nline2\n\n\nline3\n';
	const stream = createStreamFromString(input);
	const reader = new ReadNextLine(stream);
	try {
		expect(await reader.readLine()).toEqual('line1');
		expect(await reader.readLine()).toEqual('');
		expect(await reader.readLine()).toEqual('line2');
		expect(await reader.readLine()).toEqual('');
		expect(await reader.readLine()).toEqual('');
		expect(await reader.readLine()).toEqual('line3');
		expect(await reader.readLine()).toBeNull();
	} finally {
		reader.release();
	}
});
