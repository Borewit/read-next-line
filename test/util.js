import { ReadableStream } from 'node:stream/web';
import { promises as fs } from 'node:fs';

export function createStreamFromString(input) {
	const encoder = new TextEncoder();
	const encoded = encoder.encode(input);
	return new ReadableStream({
		start(controller) {
			controller.enqueue(encoded);
			controller.close();
		},
	});
}

export async function createReadableStreamFromFile(filePath) {
	const fileHandle = await fs.open(filePath, 'r');
	const fileStream = fileHandle.createReadStream();

	// Wrap the Node.js stream in a Web Streams API ReadableStream
	return new ReadableStream ({
		start(controller) {
			fileStream.on('data', (chunk) => controller.enqueue(chunk));
			fileStream.on('end', () => controller.close());
			fileStream.on('error', (err) => controller.error(err));
		},
		cancel(reason) {
			fileStream.destroy(reason);
		},
	});
}

