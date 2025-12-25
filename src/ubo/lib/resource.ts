/**
 * Resource compression and tagging for UBO proxy
 * Uses Workers CompressionStream API for brotli
 */

export async function compress(s: string): Promise<ArrayBuffer> {
	const encoder = new TextEncoder();
	const input = encoder.encode(s);

	// Use CompressionStream with gzip (Workers doesn't support brotli compression yet)
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(input);
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

	// Combine chunks into single ArrayBuffer
	const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
	const result = new Uint8Array(totalLength);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}

	return result.buffer;
}

export async function tag(s: string): Promise<string> {
	const buf = await crypto.subtle.digest(
		{ name: 'SHA-256' },
		new TextEncoder().encode(s),
	);

	// first 12 bytes should be plenty to ensure no collisions happen
	return ['"', ...new Uint32Array(buf).slice(0, 3), '"']
		.map((a) => a.toString(36)).join('');
}
