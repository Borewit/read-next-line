import * as chai from 'chai';
import chaiString from 'chai-string';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {ReadNextLine} from '../lib/read-next-line.js';
import {createReadableStreamFromFile, createStreamFromString} from "./util.js";

chai.use(chaiString);

const { expect } = chai;

// Convert `import.meta.url` to a file path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('ReadNextLine', () => {
    // Helper function to create a ReadableStream from a string

	describe('Handle line endings', ()=> {
		it('should handle Unix line ending: LF', async () => {
			const input = 'line1\nline2\nline3\n';
			const stream = createStreamFromString(input);
			const reader = new ReadNextLine(stream);

			expect(await reader.readLine()).to.equal('line1');
			expect(await reader.readLine()).to.equal('line2');
			expect(await reader.readLine()).to.equal('line3');
			expect(await reader.readLine()).to.be.null;
		});

		it('should handle Windows line ending: CR LF', async () => {
			const input = 'line1\r\nline2\r\nline3\r\n';
			const stream = createStreamFromString(input);
			const reader = new ReadNextLine(stream);

			expect(await reader.readLine()).to.equal('line1');
			expect(await reader.readLine()).to.equal('line2');
			expect(await reader.readLine()).to.equal('line3');
			expect(await reader.readLine()).to.be.null;
		});

		it('should handle a stream with an incomplete line at the end', async () => {
			const input = 'line1\nline2\nincomplete';
			const stream = createStreamFromString(input);
			const reader = new ReadNextLine(stream);

			expect(await reader.readLine()).to.equal('line1');
			expect(await reader.readLine()).to.equal('line2');
			expect(await reader.readLine()).to.equal('incomplete');
			expect(await reader.readLine()).to.be.null;
		});

	});

	describe('Text encoding', () => {

		async function countLines(sample, nrOfLinex, startsWith) {
			const readableStream = await createReadableStreamFromFile(path.join(__dirname, 'samples', sample));
			const reader = new ReadNextLine(readableStream);
			let line;
			let lineCount = 0;
			while ((line = await reader.readLine()) !== null) {
				if (lineCount === 0) {
					expect(line).to.startsWith(startsWith);
				}
				++lineCount;
			}
			expect(lineCount).to.equal(nrOfLinex);
		}

		const startsWith = 'Lorem ipsum odor amet, consectetuer adipiscing elit.'

		it('should decode UTF-8', async () => {
			await countLines('lorem-ipsem.utf-8.txt', 999, startsWith)
		});

		it('should decode UTF-8 with BOM', async () => {
			await countLines('lorem-ipsem.utf-8-bom.txt', 999, startsWith)
		});
	})

    it('should handle an empty stream', async () => {
        const input = '';
        const stream = createStreamFromString(input);
        const reader = new ReadNextLine(stream);

        expect(await reader.readLine()).to.be.null;
    });

    it('should handle a stream with a single line and no newline', async () => {
        const input = 'singleLine';
        const stream = createStreamFromString(input);
        const reader = new ReadNextLine(stream);

        expect(await reader.readLine()).to.equal('singleLine');
        expect(await reader.readLine()).to.be.null;
    });

    it('should handle a stream with multiple consecutive newlines', async () => {
        const input = 'line1\n\nline2\n\n\nline3\n';
        const stream = createStreamFromString(input);
        const reader = new ReadNextLine(stream);

        expect(await reader.readLine()).to.equal('line1');
        expect(await reader.readLine()).to.equal('');
        expect(await reader.readLine()).to.equal('line2');
        expect(await reader.readLine()).to.equal('');
        expect(await reader.readLine()).to.equal('');
        expect(await reader.readLine()).to.equal('line3');
        expect(await reader.readLine()).to.be.null;
    });

});
