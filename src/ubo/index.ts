/**
 * UBO (uBlock Origin) Proxy Service
 *
 * Proxies and caches uBlock Origin filter lists and assets
 */

import * as Assets from './lib/ublock';
import * as Util from './lib/util';
import { initEnv, type UboEnv } from './lib/env';

const handleData = (request: Request) => {
	const url = new URL(request.url);

	if (url.pathname === '/assets.json') {
		return Assets.handleAssets();
	}

	return Assets.handleFilterlist(url.pathname);
};

const handle = async (request: Request): Promise<Response> => {
	if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
		throw { status: 405, text: 'method not allowed' };
	}

	// Check for gzip support (changed from brotli since Workers uses gzip)
	const acceptsGzip = request.headers.get('accept-encoding')
		?.split(', ', 8).some((enc) => enc === '*' || enc === 'gzip');

	if (!acceptsGzip) {
		throw { status: 406, text: 'this service requires gzip encoding support' };
	}

	const [data, etag] = await handleData(request);
	const cachedOnClient = request.headers.get('if-none-match')
		?.split(', ', 8)
		.includes(etag);

	const headers = {
		'Cache-Control': 'public, max-age=3600',
		'Content-Type': data.type,
		'Content-Length': String(data.size),
		'Content-Encoding': 'gzip', // Changed from 'br' to 'gzip'
		'ETag': etag,
		'Vary': 'Accept-Encoding',
	};

	if (request.method === 'OPTIONS') {
		return new Response(null, {
			status: 204,
			headers: {
				Allow: 'OPTIONS, GET, HEAD',
				...headers,
			},
		});
	} else if (request.method === 'HEAD' || cachedOnClient) {
		return new Response(null, {
			status: cachedOnClient ? 304 : 200,
			headers,
		});
	}

	return new Response(
		data.stream(),
		{ headers },
	);
};

export const handleUboProxy = async (request: Request, env: UboEnv): Promise<Response> => {
	try {
		// Initialize environment on first request
		initEnv(env);
		return await handle(request);
	} catch (e) {
		return Util.respondWithError(e);
	}
};
