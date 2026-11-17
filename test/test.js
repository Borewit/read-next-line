import * as chai from 'chai';
import chaiString from 'chai-string';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {Readable} from 'node:stream';
import {ReadableStream} from 'node:stream/web';
import {LineSplitter, ReadNextLine} from '../lib/read-next-line.js';
import {createWebReadableStreamFromFile, createStreamFromString, createNodeReadableStreamFromFile} from "./util.js";

chai.use(chaiString);

const {expect} = chai;

// Convert `import.meta.url` to a file path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Partial lines across chunks', () => {
	const encodeChunks = (chunks) => {
		const encoder = new TextEncoder();
		return chunks.map(chunk => encoder.encode(chunk));
	};
	const createWebStream = (chunks) => new ReadableStream({
		start(controller) {
			for (const chunk of encodeChunks(chunks)) {
				controller.enqueue(chunk);
			}
			controller.close();
		},
	});
	const implementations = [
		['ReadNextLine with Web streams', chunks => new ReadNextLine(createWebStream(chunks))],
		['ReadNextLine with Node.js streams', chunks => new ReadNextLine(Readable.from(encodeChunks(chunks)))],
		['LineSplitter', chunks => {
			const reader = createWebStream(chunks).pipeThrough(new LineSplitter()).getReader();
			return {
				async readLine() {
					const {done, value} = await reader.read();
					return done ? null : value;
				},
				release() {
					reader.releaseLock();
				},
			};
		}],
	];
	const cases = [
		['a line split across two chunks', ['hel', 'lo\n'], ['hello']],
		['a line split across several chunks', ['h', 'e', 'l', 'l', 'o\n'], ['hello']],
		['an unterminated final line', ['hel', 'lo'], ['hello']],
		['consumed lines followed by partial lines', ['first\nsec', 'ond\nthi', 'rd\n'], ['first', 'second', 'third']],
		['empty chunks between line fragments', ['hel', '', 'lo\n'], ['hello']],
		['CRLF split across chunks', ['a\r', '\nb\n'], ['a', 'b']],
		['LFCR split across chunks', ['a\n', '\rb\n'], ['a', 'b']],
	];

	for (const [implementation, createReader] of implementations) {
		describe(implementation, () => {
			for (const [name, chunks, expected] of cases) {
				it(`should handle ${name} without duplicating buffered text`, async () => {
					const reader = createReader(chunks);
					try {
						for (const line of expected) {
							expect(await reader.readLine()).to.equal(line);
						}
						expect(await reader.readLine()).to.be.null;
					} finally {
						reader.release();
					}
				});
			}
		});
	}
});

describe('ReadNextLine', () => {
	// Helper function to create a ReadableStream from a string

	describe('Handle line endings', () => {
		it('should handle Unix line ending: LF', async () => {
			const input = 'line1\nline2\nline3\n\n';
			const stream = createStreamFromString(input);
			const reader = new ReadNextLine(stream);
			try {
				expect(await reader.readLine()).to.equal('line1');
				expect(await reader.readLine()).to.equal('line2');
				expect(await reader.readLine()).to.equal('line3');
				expect(await reader.readLine()).to.equal('');
				expect(await reader.readLine()).to.be.null;
			} finally {
				reader.release();
			}

		});

		it('should handle Windows line ending: CR LF', async () => {
			const input = 'line1\r\nline2\r\nline3\r\n\r\n';
			const stream = createStreamFromString(input);
			const reader = new ReadNextLine(stream);
			try {
				expect(await reader.readLine()).to.equal('line1');
				expect(await reader.readLine()).to.equal('line2');
				expect(await reader.readLine()).to.equal('line3');
				expect(await reader.readLine()).to.equal('');
				expect(await reader.readLine()).to.be.null;
			} finally {
				reader.release();
			}

		});

		it('should handle line ending: LF CR', async () => {
			const input = 'line1\n\rline2\n\rline3\n\r\n\r';
			const stream = createStreamFromString(input);
			const reader = new ReadNextLine(stream);
			try {
				expect(await reader.readLine()).to.equal('line1');
				expect(await reader.readLine()).to.equal('line2');
				expect(await reader.readLine()).to.equal('line3');
				expect(await reader.readLine()).to.equal('');
				expect(await reader.readLine()).to.be.null;
			} finally {
				reader.release();
			}

		});

		it('should handle a stream with an incomplete line at the end', async () => {
			const input = 'line1\nline2\nincomplete';
			const stream = createStreamFromString(input);
			const reader = new ReadNextLine(stream);
			try {
				expect(await reader.readLine()).to.equal('line1');
				expect(await reader.readLine()).to.equal('line2');
				expect(await reader.readLine()).to.equal('incomplete');
				expect(await reader.readLine()).to.be.null;
			} finally {
				reader.release();
			}
		});

	});

	async function countLines(stream, nrOfLinex, startsWith) {
		const reader = new ReadNextLine(stream);
		try {
			let line;
			let lineCount = 0;
			while ((line = await reader.readLine()) !== null) {
				if (lineCount === 0) {
					expect(line).to.startsWith(startsWith);
				}
				++lineCount;
			}
			expect(lineCount).to.equal(nrOfLinex);
		} finally {
			reader.release();
		}
	}

	const startsWith = 'Lorem ipsum odor amet, consectetuer adipiscing elit.'

	describe('Text encoding from Web ReadableStream', () => {

		async function countLinesFromWebStream(sample, nrOfLinex, startsWith) {
			const webStream = await createWebReadableStreamFromFile(path.join(__dirname, 'samples', sample));
			return countLines(webStream, nrOfLinex, startsWith);
		}

		it('should decode UTF-8', async () => {
			await countLinesFromWebStream('lorem-ipsem.utf-8.txt', 999, startsWith)
		});

		it('should decode UTF-8 with BOM', async () => {
			await countLinesFromWebStream('lorem-ipsem.utf-8-bom.txt', 999, startsWith)
		});

		it('should decode UTF-16 BE BOM', async () => {
			await countLinesFromWebStream('lorem-ipsem.utf-16-be-bom.txt', 999, startsWith)
		});

		it('should decode UTF-16 LE BOM', async () => {
			await countLinesFromWebStream('lorem-ipsem.utf-16-le-bom.txt', 999, startsWith)
		});
	});

	describe('Text encoding from Node.js Readable', () => {

		async function countLinesFromNodeStream(sample, nrOfLinex, startsWith) {
			const nodeReadable = await createNodeReadableStreamFromFile(path.join(__dirname, 'samples', sample));
			return countLines(nodeReadable, nrOfLinex, startsWith);
		}

		it('should decode UTF-8', async () => {
			await countLinesFromNodeStream('lorem-ipsem.utf-8.txt', 999, startsWith)
		});

		it('should decode UTF-8 with BOM', async () => {
			await countLinesFromNodeStream('lorem-ipsem.utf-8-bom.txt', 999, startsWith)
		});

		it('should decode UTF-16 BE BOM', async () => {
			await countLinesFromNodeStream('lorem-ipsem.utf-16-be-bom.txt', 999, startsWith)
		});

		it('should decode UTF-16 LE BOM', async () => {
			await countLinesFromNodeStream('lorem-ipsem.utf-16-le-bom.txt', 999, startsWith)
		});
	});


	it('should handle an empty stream', async () => {
		const input = '';
		const stream = createStreamFromString(input);
		const reader = new ReadNextLine(stream);
		try {
			expect(await reader.readLine()).to.be.null;
		} finally {
			reader.release();
		}
	});

	it('should handle a stream with a single line and no newline', async () => {
		const input = 'singleLine';
		const stream = createStreamFromString(input);
		const reader = new ReadNextLine(stream);
		try {
			expect(await reader.readLine()).to.equal('singleLine');
			expect(await reader.readLine()).to.be.null;
		} finally {
			reader.release();
		}
	});

	it('should handle a stream with multiple consecutive newlines', async () => {
		const input = 'line1\n\nline2\n\n\nline3\n';
		const stream = createStreamFromString(input);
		const reader = new ReadNextLine(stream);
		try {
			expect(await reader.readLine()).to.equal('line1');
			expect(await reader.readLine()).to.equal('');
			expect(await reader.readLine()).to.equal('line2');
			expect(await reader.readLine()).to.equal('');
			expect(await reader.readLine()).to.equal('');
			expect(await reader.readLine()).to.equal('line3');
			expect(await reader.readLine()).to.be.null;
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
		expect(await reader.readLine()).to.equal('line1');
		expect(await reader.readLine()).to.equal('');
		expect(await reader.readLine()).to.equal('line2');
		expect(await reader.readLine()).to.equal('');
		expect(await reader.readLine()).to.equal('');
		expect(await reader.readLine()).to.equal('line3');
		expect(await reader.readLine()).to.be.null;
	} finally {
		reader.release();
	}
});
