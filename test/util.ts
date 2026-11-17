import { promises as fs } from 'node:fs';
import { Readable } from 'node:stream';
import { ReadableStream } from 'node:stream/web';

export function createStreamFromString(input: string) {
	const encoder = new TextEncoder();
	const encoded = encoder.encode(input);
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(encoded);
			controller.close();
		}
	});
}

export async function createNodeReadableStreamFromFile(filePath: string) {
	const fileHandle = await fs.open(filePath, 'r');
	return fileHandle.createReadStream();
}

export async function createWebReadableStreamFromFile(filePath: string) {
	const fileStream = await createNodeReadableStreamFromFile(filePath);
	return Readable.toWeb(fileStream);
}
