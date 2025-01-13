import {expect} from 'chai';
import {ReadNextLine} from '../lib/read-next-line.js';
import {ReadableStream} from 'node:stream/web';

describe('ReadNextLine', () => {
    // Helper function to create a ReadableStream from a string
    function createStreamFromString(input) {
        const encoder = new TextEncoder();
        const encoded = encoder.encode(input);
        return new ReadableStream({
            start(controller) {
                controller.enqueue(encoded);
                controller.close();
            },
        });
    }

    it('should read lines separated by newline', async () => {
        const input = 'line1\nline2\nline3\n';
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
