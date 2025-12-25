/**
 * Dictionary Proxy
 *
 * Proxies Chromium Hunspell dictionaries from Google's source
 * with caching and proper content encoding
 */

const DICT_BASE_URL = 'https://chromium.googlesource.com/chromium/deps/hunspell_dictionaries/+/refs/heads/main/';

export const handleDictionary = async (request: Request): Promise<Response> => {
	const url = new URL(request.url);
	const dictPath = url.pathname.replace('/dict/', '').replace('/dict', '');

	if (!dictPath) {
		// Return directory listing or 404
		return new Response('Dictionary path required', { status: 404 });
	}

	// Construct URL to raw dictionary file
	// Remove .gz extension if present (we'll serve compressed from source)
	const cleanPath = dictPath.replace(/\.gz$/, '');
	const dictUrl = `${DICT_BASE_URL}${cleanPath}?format=TEXT`;

	try {
		// Fetch from Chromium source (base64 encoded)
		const response = await fetch(dictUrl);

		if (!response.ok) {
			return new Response('Dictionary not found', { status: 404 });
		}

		// Decode base64 response
		const base64Content = await response.text();
		const binaryString = atob(base64Content);
		const bytes = new Uint8Array(binaryString.length);
		for (let i = 0; i < binaryString.length; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}

		// Compress with gzip for serving
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(bytes);
				controller.close();
			},
		}).pipeThrough(new CompressionStream('gzip'));

		// Collect compressed chunks
		const chunks: Uint8Array[] = [];
		const reader = stream.getReader();
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(value);
		}

		// Combine chunks
		const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
		const compressed = new Uint8Array(totalLength);
		let offset = 0;
		for (const chunk of chunks) {
			compressed.set(chunk, offset);
			offset += chunk.length;
		}

		// Determine content type
		const contentType = dictPath.endsWith('.dic') || dictPath.endsWith('.aff')
			? 'text/plain; charset=utf-8'
			: 'application/octet-stream';

		return new Response(compressed, {
			headers: {
				'Content-Type': contentType,
				'Content-Encoding': 'gzip',
				'Cache-Control': 'public, max-age=86400, immutable',
				'Vary': 'Accept-Encoding',
			},
		});
	} catch (error) {
		console.error('Dictionary fetch error:', error);
		return new Response('Error fetching dictionary', { status: 500 });
	}
};
