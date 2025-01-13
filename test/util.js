import { ReadableStream } from 'node:stream/web';
import { promises as fs } from 'node:fs';

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

