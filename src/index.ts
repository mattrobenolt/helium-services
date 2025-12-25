/**
 * Helium Services - Cloudflare Workers Entry Point
 *
 * Routes requests to appropriate service handlers
 */

import { handleExtensionProxy } from './extension-proxy';
import { handleUboProxy } from './ubo';
import { handleDictionary } from './dictionaries';
import { handleBangs } from './bangs';

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;

		// Root redirect
		if (path === '/') {
			return Response.redirect('https://helium.computer', 302);
		}

		// Robots.txt
		if (path === '/robots.txt') {
			return new Response('User-agent: *\nDisallow: /\n', {
				headers: { 'Content-Type': 'text/plain' },
			});
		}

		// Bangs.json - dynamically generated and cached in KV
		if (path === '/bangs.json') {
			return handleBangs(request, env);
		}

		// Mac updates proxy
		if (path.startsWith('/updates/mac')) {
			const targetUrl = `https://updates.helium.computer${path.replace('/updates', '')}`;
			return fetch(targetUrl);
		}

		// Dictionaries - Chromium Hunspell dictionaries
		if (path.startsWith('/dict')) {
			return handleDictionary(request);
		}

		// Extension proxy service - Chrome Web Store proxy
		if (path.startsWith('/ext/') || path === '/com') {
			return handleExtensionProxy(request);
		}

		// uBlock Origin assets proxy
		if (path.startsWith('/ubo/')) {
			// Strip /ubo prefix and pass modified request
			const uboUrl = new URL(request.url);
			uboUrl.pathname = path.replace('/ubo', '');
			const uboRequest = new Request(uboUrl, request);
			return handleUboProxy(uboRequest, env);
		}

		// 404 for unknown routes
		return new Response('Not Found', { status: 404 });
	},
} satisfies ExportedHandler<Env>;

/**
 * Environment bindings
 */
export interface Env {
	// KV for bangs cache
	BANGS_KV?: KVNamespace;

	// UBO Proxy
	UBO_PROXY_BASE_URL?: string;

	// Extension Proxy
	HMAC_SECRET?: string;
	PROXY_BASE_URL?: string;

	// Add additional bindings as needed:
	// - R2 buckets for static assets
	// - Durable Objects for stateful services
}
