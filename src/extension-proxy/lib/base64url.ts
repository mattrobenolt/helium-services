// Base64URL encoding/decoding using browser APIs

export const decodeBase64 = (input: string): Uint8Array => {
	// Convert base64url to base64
	const base64 = input
		.replaceAll('-', '+')
		.replaceAll('_', '/');

	// Decode using atob
	const binaryString = atob(base64);
	const bytes = new Uint8Array(binaryString.length);
	for (let i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}
	return bytes;
};

export const encodeBase64 = (input: Uint8Array | ArrayBuffer): string => {
	const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : input;

	// Convert to binary string
	let binaryString = '';
	for (let i = 0; i < bytes.length; i++) {
		binaryString += String.fromCharCode(bytes[i]);
	}

	// Encode to base64 and convert to base64url
	return btoa(binaryString)
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replaceAll('=', '');
};
