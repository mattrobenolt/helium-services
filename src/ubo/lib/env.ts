/**
 * Environment configuration for UBO proxy
 * Lazy initialization for Workers compatibility
 */

export interface UboEnv {
	UBO_PROXY_BASE_URL?: string;
}

let _env: { baseURL: string } | null = null;

export function initEnv(workerEnv: UboEnv) {
	if (_env) return _env;

	const baseURL = workerEnv.UBO_PROXY_BASE_URL;
	if (!baseURL) {
		throw new Error('UBO_PROXY_BASE_URL environment variable is required');
	}

	_env = { baseURL };
	return _env;
}

export function getEnv(): { baseURL: string } {
	if (!_env) {
		throw new Error('Environment not initialized. Call initEnv() first.');
	}
	return _env;
}

// Backwards compatibility export
export const env = new Proxy({} as { baseURL: string }, {
	get(target, prop) {
		return getEnv()[prop as keyof typeof target];
	},
});
