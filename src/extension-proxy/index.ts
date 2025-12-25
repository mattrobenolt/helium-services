/**
 * Extension Proxy Service
 *
 * Proxies Chrome Web Store extension update requests (Omaha protocol)
 * with privacy-enhancing features like request mixing
 */

import * as Util from './lib/util';
import * as Handlers from './lib/handlers';

export const handleExtensionProxy = async (request: Request): Promise<Response> => {
	try {
		return await Handlers.handle(request);
	} catch (e) {
		return Util.respondWithError(e);
	}
};
