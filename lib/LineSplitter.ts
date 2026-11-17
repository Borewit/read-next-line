import { TransformStream, type TransformStreamDefaultController } from 'node:stream/web';

// Define common BOM signatures
const BOM_UTF_8 = new Uint8Array([0xef, 0xbb, 0xbf]);
const BOM_UTF_16_LE = new Uint8Array([0xff, 0xfe]);
const BOM_UTF_16_BE = new Uint8Array([0xfe, 0xff]);

type TextEncodingType = 'utf-8' | 'utf-16le' | 'utf-16be';

function extractEncoding(uint8Array: Uint8Array): TextEncodingType | undefined {
	if (uint8Array.byteLength >= 2) {
		if (uint8Array[0] === BOM_UTF_16_LE[0] && uint8Array[1] === BOM_UTF_16_LE[1]) {
			return 'utf-16le';
		}
		if (uint8Array[0] === BOM_UTF_16_BE[0] && uint8Array[1] === BOM_UTF_16_BE[1]) {
			return 'utf-16be';
		}
	}
	if (
		uint8Array.byteLength >= 3 &&
		uint8Array[0] === BOM_UTF_8[0] &&
		uint8Array[1] === BOM_UTF_8[1] &&
		uint8Array[2] === BOM_UTF_8[2]
	) {
		return 'utf-8';
	}
}

export class LineSplitter extends TransformStream<Uint8Array, string> {
	private buffer = '';
	private readonly separator: RegExp = /\r\n|\n\r|\n|\r/;
	private decoder?: TextDecoder;
	private pendingSeparator?: '\r' | '\n';

	constructor() {
		super({
			transform: (chunk, controller) => {
				if (!this.decoder) {
					const textEncoding = extractEncoding(chunk);
					this.decoder = new TextDecoder(textEncoding);
				}

				// Keep the decoder state between chunks so fragmented characters are decoded correctly.
				this.processText(this.decoder.decode(chunk, { stream: true }), controller, false);
			},
			flush: controller => {
				// Flush any bytes retained by the decoder, then process the final line.
				const finalText = this.decoder ? this.decoder.decode() : '';
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
