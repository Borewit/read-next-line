import { TransformStream, type TransformStreamDefaultController } from 'node:stream/web';

function selectEncoding(first: number, second: number): string {
	if (first === 0xff && second === 0xfe) {
		return 'utf-16le';
	}
	if (first === 0xfe && second === 0xff) {
		return 'utf-16be';
	}
	return 'utf-8';
}

export class LineSplitter extends TransformStream<Uint8Array, string> {
	private buffer = '';
	private readonly separator: RegExp = /\r\n|\n\r|\n|\r/;
	private decoder?: TextDecoder;
	private initialByte?: number;
	private pendingSeparator?: '\r' | '\n';

	constructor() {
		super({
			transform: (chunk, controller) => {
				if (!chunk.length) {
					return;
				}
				let prefix = '';
				if (!this.decoder) {
					const first = this.initialByte ?? chunk[0];
					if (this.initialByte === undefined && chunk.length === 1 && (first === 0xff || first === 0xfe)) {
						this.initialByte = first;
						return;
					}
					const second = this.initialByte === undefined ? chunk[1] : chunk[0];
					this.decoder = new TextDecoder(selectEncoding(first, second));
					if (this.initialByte !== undefined) {
						prefix = this.decoder.decode(Uint8Array.of(first), { stream: true });
						this.initialByte = undefined;
					}
				}
				this.processText(prefix + this.decoder.decode(chunk, { stream: true }), controller, false);
			},
			flush: controller => {
				const finalText = this.decoder ? this.decoder.decode() : this.initialByte === undefined ? '' : '\ufffd';
				this.processText(finalText, controller, true);
				this.buffer = '';
			}
		});
	}

	private processText(text: string, controller: TransformStreamDefaultController<string>, flush: boolean): void {
		let textChunk = this.buffer + text;

		// Consume the complementary half of a separator split across chunks, without emitting another line.
		if (this.pendingSeparator !== undefined && (textChunk.length > 0 || flush)) {
			const complement = this.pendingSeparator === '\r' ? '\n' : '\r';
			if (textChunk.startsWith(complement)) {
				textChunk = textChunk.substring(1);
			}
			this.pendingSeparator = undefined;
		}

		let position: number;
		while ((position = textChunk.search(this.separator)) !== -1) {
			const separatorLength = textChunk.startsWith('\r\n', position) || textChunk.startsWith('\n\r', position) ? 2 : 1;
			controller.enqueue(textChunk.substring(0, position));
			const separator = textChunk.charAt(position);
			textChunk = textChunk.substring(position + separatorLength);
			if (!flush && separatorLength === 1 && textChunk.length === 0) {
				this.pendingSeparator = separator as '\r' | '\n';
			}
		}

		if (flush && textChunk.length > 0) {
			controller.enqueue(textChunk);
			textChunk = '';
		}
		this.buffer = textChunk;
	}
}
