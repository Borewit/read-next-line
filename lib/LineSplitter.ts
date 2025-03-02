// Define common BOM signatures
const BOM_UTF_8 = new Uint8Array([0xEF, 0xBB, 0xBF]);
const BOM_UTF_16_LE = new Uint8Array([0xFF, 0xFE]);
const BOM_UTF_16_BE = new Uint8Array([0xFE, 0xFF]);

type TextEncodingType = 'utf-8' | 'utf-16le' | 'utf-16be';

function extractEncoding(uint8Array: Uint8Array): TextEncodingType | undefined {
	if (uint8Array.byteLength >= 2) {
		if (uint8Array[0] === BOM_UTF_16_LE[0] &&
			uint8Array[1] === BOM_UTF_16_LE[1]) {
			return 'utf-16le';
		} else if (uint8Array[0] === BOM_UTF_16_BE[0] &&
			uint8Array[1] === BOM_UTF_16_BE[1]) {
			return 'utf-16be';
		}
	}
	if (uint8Array.byteLength >= 3 && uint8Array[0] === BOM_UTF_8[0] &&
		uint8Array[1] === BOM_UTF_8[1] &&
		uint8Array[2] === BOM_UTF_8[2]) {
		return 'utf-8';
	}
}

export class LineSplitter extends TransformStream<Uint8Array, string> {
	private buffer: string = '';
	private readonly separator: RegExp = /\r\n|\n\r|\n|\r/;
	private decoder?: TextDecoder;
	private textEncoding?: string;

    constructor() {
        super({
            transform: (chunk, controller) => {
                if (!this.decoder) {
					this.textEncoding = extractEncoding(chunk);
					this.decoder = new TextDecoder(this.textEncoding);
				}

				// Append the new chunk to the buffer.
				let textChunk =  this.buffer + this.decoder.decode(chunk);

				// Search separator
				let position: number;
				do {
					position = textChunk.search(this.separator);
					if (position !== -1) {
						if (position + 1 >= textChunk.length) {
							break;
						}
						const line = textChunk.substring(0, position);
						controller.enqueue(line);
						if (textChunk.startsWith('\r\n', position) || textChunk.startsWith('\n\r', position)) {
							textChunk = textChunk.substring(position + 2);
						} else {
							textChunk = textChunk.substring(position + 1);
						}
					}
				} while(position !== -1)
				this.buffer += textChunk;
            },
            flush: (controller) => {
				if (this.buffer.length > 0) {
					const position = this.buffer.search(this.separator);
					if (position === -1) {
						controller.enqueue(this.buffer);
					} else {
						controller.enqueue(this.buffer.substring(0, position));
					}
				}
				this.buffer = '';
            }
        });
    }
}
