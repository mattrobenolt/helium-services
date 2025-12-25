import { decodeBase64, encodeBase64 } from './base64url';
import * as Util from './util';

// Workers-compatible proxy with lazy initialization from env

interface ProxyEnv {
	HMAC_SECRET?: string;
	PROXY_BASE_URL?: string;
}

let initialized = false;
let baseOrigin: URL | undefined;
let secret: CryptoKey | undefined;

const initialize = async (env: ProxyEnv) => {
	if (initialized) return;
	initialized = true;

	// Initialize secret
	if (env.HMAC_SECRET) {
		const secret_str = env.HMAC_SECRET;
		if (secret_str.length >= 32) {
			const secretBytes = new TextEncoder().encode(secret_str);
			secret = await crypto.subtle.importKey(
				'raw',
				secretBytes,
				{ name: 'HMAC', hash: { name: 'SHA-256' } },
				false,
				['sign', 'verify'],
			);
		} else {
			console.error('HMAC_SECRET is too short (<32 chars), CRX requests will not be proxied');
		}
	} else {
		console.error('HMAC_SECRET is not set, CRX requests will not be proxied');
	}

	// Initialize base URL
	if (env.PROXY_BASE_URL) {
		try {
			baseOrigin = new URL(env.PROXY_BASE_URL);
		} catch (e) {
			console.error('Invalid PROXY_BASE_URL:', e);
		}
	} else {
		console.error('PROXY_BASE_URL is not set, CRX requests will not be proxied');
	}
};

const sign = async (url: string, expiry: number) => {
	Util.parseURLStrict(url); // sanity check, should throw if url is invalid

	if (!secret) {
		throw 'HMAC secret not initialized';
	}

	const signature = await crypto.subtle.sign(
		'HMAC',
		secret,
		new TextEncoder().encode(
			JSON.stringify({ url, expiry }),
		),
	);

	return encodeBase64(new Uint8Array(signature));
};

const verify = async (url: string, exp: string, sig: string) => {
	Util.parseURLStrict(url); // sanity check, should throw if url is invalid

	if (!secret) {
		throw 'HMAC secret not initialized';
	}

	const signature = decodeBase64(sig);
	const ok = await crypto.subtle.verify(
		'HMAC',
		secret,
		signature,
		new TextEncoder().encode(
			JSON.stringify({ url, expiry: Number(exp) }),
		),
	);

	if (!ok) {
		throw 'signature verification failed';
	}
};

export const wrap = async (url: string, env: ProxyEnv) => {
	await initialize(env);

	if (!baseOrigin || !secret) {
		return url;
	}

	const proxyURL = new URL(baseOrigin);
	const expiry = Util.now() + Util.ms.hours(1);

	if (!proxyURL.pathname.endsWith('/')) {
		proxyURL.pathname += '/';
	}
	proxyURL.pathname += 'proxy';
	proxyURL.searchParams.set('url', url);
	proxyURL.searchParams.set('sig', await sign(url, expiry));
	proxyURL.searchParams.set('exp', expiry.toString());

	return proxyURL.toString();
};

export const unwrap = async (url_: string, env: ProxyEnv) => {
	await initialize(env);

	if (!baseOrigin || !secret) {
		throw { status: 404, text: 'content proxying is disabled' };
	}

	const url = new URL(url_);
	const originalURL = url.searchParams.get('url');
	const signature = url.searchParams.get('sig');
	const expiry = url.searchParams.get('exp');

	if (!originalURL || !signature || !expiry) {
		throw 'malformed url';
	}

	await verify(originalURL, expiry, signature);

	if (Util.now() > +expiry) {
		throw { status: 410, text: 'URL expired' };
	}

	return originalURL;
};
