[![Node.js CI](https://github.com/Borewit/read-next-line/actions/workflows/nodejs-ci.yml/badge.svg)](https://github.com/Borewit/read-next-line/actions/workflows/nodejs-ci.yml)
[![NPM version](https://img.shields.io/npm/v/read-next-line.svg)](https://npmjs.org/package/read-next-line)
[![npm downloads](http://img.shields.io/npm/dm/read-next-line.svg)](https://npmcharts.com/compare/read-next-line)

# `read-next-line`
Is s a lightweight, efficient utility for reading lines from a [ReadableStream](https://developer.mozilla.org/docs/Web/API/ReadableStream) in JavaScript.
The primary goal of this module is to enable memory-efficient line-by-line processing of large data streams,
such as logs, files, or real-time data feeds.

## Features

- **Line-based processing**: Reads lines directly from any [ReadableStream](https://developer.mozilla.org/docs/Web/API/ReadableStream).
- **Memory efficiency**: Keeps memory usage low by processing one line at a time.
- **Browser compatibility**: Works seamlessly with modern web browsers.
- **Node.js compatibility**: Works seamlessly with [Node.js Web Streams API](https://nodejs.org/api/webstreams.html#web-streams-api).
- Supports the following **text encoding**:
  - UTF-8 (default)
  - UTF-8 with the BOM field set
  - UTF-16LE with the BOM field is set
  - UTF-16BE with the BOM field is set
- Supports different [line endings](https://en.wikipedia.org/wiki/Newline):
  - Windows (`CR LF`)
  - Unix (`LF`)
  - Acorn BBC / RISC OS (`LF CR`).

## Installation

Install the package via npm:

```bash
npm install read-next-line
```

## Compatibility
**read-next-line** is a hybrid ECMAScript Module (ESM) with CommonJS backwards compatibility support. Designed to work with Works seamlessly with [Node.js Web Streams API](https://nodejs.org/api/webstreams.html#web-streams-api) or [Streams_API](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API) in the browser.
Compatible with modern web browsers or Node.js ≥ 18.

## Usage

Import and use `StreamLineReader` in your project:

In ESM projects or any TypeScript project use:
```js
import {ReadNextLine} from 'read-next-line';
```

In CommonJS projects use:
```js
const {ReadNextLine} = require('read-next-line');
```

Using **read-next-line** to read lines of text of a binary [ReadableStream](https://developer.mozilla.org/docs/Web/API/ReadableStream):
```js
async function processStream(stream) {
	const reader = new ReadNextLine(stream);

	let line;
	while ((line = await reader.readLine()) !== null) {
		console.log(line); // Process each line as needed
	}
}
```

### Parsing a Blob/File

To process a file input, wrap the file's stream with `ReadNextLine`:

```js
const file = document.querySelector('input[type="file"]').files[0];
const reader = new ReadNextLine(file.stream());

let line;
while ((line = await reader.readLine()) !== null) {
	console.log(line);
}
```

## API

### `StreamLineReader` Class

#### Constructor

```ts
new StreamLineReader(stream: ReadableStream<Uint8Array>);
```

- **stream**: The `ReadableStream` to process.

#### Methods

- **`readLine(): Promise<string | null>`**
	- Reads the next line from the stream. Returns `null` if the stream ends.

## How It Works

`StreamLineReader`:

1. Reads lines directly from a `ReadableStream` using a `TextDecoderStream` to decode binary data into text.
2. Splits the decoded text by Unix (`\n`) or Windows (`\r\n`) line endings.
3. Buffers incomplete lines for the next read operation.


## License

This project is licensed under the MIT License. Feel free to use, modify, and distribute as needed.
