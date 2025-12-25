/**
 * Dynamic Bangs Generator with KV Caching
 *
 * Fetches from Kagi's bangs repository, adds custom extras,
 * and caches in Cloudflare KV for fast delivery
 */

const VERSION = '202512011623';
const BANG_CHECKSUM = '79a27f2d7ee96d0778e464623f1d2ab9630d5ed37ad47839d81932a6af4b03c3';
const KV_KEY = 'bangs:json';
const CACHE_TTL = 86400; // 24 hours

const prefix = `https://raw.githubusercontent.com/kagisearch/bangs/refs/tags/${VERSION}`;

// Custom extras (from extras.json)
const EXTRAS = [
	{
		"s": "cobalt",
		"ts": ["co", "cobalt"],
		"u": "https://cobalt.tools/#{{{s}}}"
	},
	{
		"s": "Kagi",
		"ts": ["k", "kagi"],
		"u": "https://kagi.com/search?q={{{s}}}"
	},
	{
		"s": "Kagi Translate",
		"ts": ["kt", "tr", "ktr", "kagit"],
		"u": "https://translate.kagi.com/?from=auto&to=en&text={{{s}}}"
	},
	{
		"s": "Kagi Assistant",
		"ts": ["kai", "kaa", "kag", "kga", "kassistant"],
		"u": "https://kagi.com/assistant?q={{{s}}}",
		"sc": "AI Chatbots"
	},
	{
		"s": "Helium Bangs",
		"ts": ["bang", "bangs", "heliumbangs"],
		"u": "https://helium.computer/bangs#{{{s}}}"
	},
	{
		"s": "Helium Code",
		"ts": ["hcr", "helium"],
		"u": "https://github.com/search?type=code&q=repo:imputnet/helium+{{{s}}}"
	},
	{
		"s": "Helium macOS Code",
		"ts": ["hcrm", "heliummac"],
		"u": "https://github.com/search?type=code&q=repo:imputnet/helium-macos+{{{s}}}"
	},
	{
		"s": "Helium Linux Code",
		"ts": ["hcrl", "heliumlinux"],
		"u": "https://github.com/search?type=code&q=repo:imputnet/helium-linux+{{{s}}}"
	},
	{
		"s": "Helium Windows Code",
		"ts": ["hcrw", "heliumwindows"],
		"u": "https://github.com/search?type=code&q=repo:imputnet/helium-windows+{{{s}}}"
	}
];

const categoryMap: Record<string, string> = {
	"AI Chatbots": 'ai'
};

interface RawBang {
	s: string; // site name
	d?: string; // domain
	ad?: string; // alt domain
	t?: string; // trigger
	ts?: string[]; // extra triggers
	u: string; // URL template
	c?: string; // category
	sc?: string; // subcategory
	fmt?: string[]; // format flags
	skip_tests?: boolean;
	x?: string; // regex pattern
}

interface TransformedBang {
	s: string;
	ts: string[];
	u: string;
	sc?: string;
}

const digest = async (str: string): Promise<string> => {
	const u8 = new TextEncoder().encode(str);
	const hashBytes = await crypto.subtle.digest('SHA-256', u8);
	return [...new Uint8Array(hashBytes)]
		.map(a => a.toString(16).padStart(2, '0'))
		.join('');
};

const load = async () => {
	const bangText = await fetch(prefix + '/data/bangs.json').then(a => a.text());
	const checksum = await digest(bangText);

	if (checksum !== BANG_CHECKSUM) {
		throw new Error(`checksum does not match: ${checksum}`);
	}

	const bangs: RawBang[] = JSON.parse(bangText);
	return { bangs, extras: EXTRAS };
};

const transformBang = (
	bang: RawBang,
	seen: Set<string>,
	dupes?: Set<string>
): TransformedBang | null => {
	const { s, t, ts: rawTs, u, sc } = bang;

	const transformedURL = u.replace(/{{{s}}}/g, '{searchTerms}');
	if (!u.includes('{{{s}}}') || transformedURL.includes('{{{s}}}')) {
		console.error(`malformed url for ${t}: ${u}`);
		return null;
	}

	let ts = [...(rawTs || [])];
	if (t) {
		ts.push(t);
	}

	ts = ts
		.map(t => t.toLowerCase())
		.filter(t => !dupes || !dupes.has(t))
		.sort((a, b) => (a.length - b.length) || a.localeCompare(b));

	for (const trigger of ts) {
		if (seen.has(trigger)) {
			console.error(`duplicate bang key: !${trigger}`);
			return null;
		}
		seen.add(trigger);
	}

	if (ts.length === 0) {
		return null;
	}

	return {
		s,
		ts,
		u: transformedURL,
		sc: sc ? categoryMap[sc] : undefined
	};
};

const transform = ({ bangs, extras }: { bangs: RawBang[], extras: RawBang[] }) => {
	const seen = new Set<string>();

	// Process extras first
	const extraBangs: TransformedBang[] = [];
	for (const bang of extras) {
		const transformed = transformBang(bang, seen);
		if (transformed) {
			extraBangs.push(transformed);
		}
	}

	const extraTriggers = new Set(seen);

	// Filter and process main bangs
	const strippedBangs: TransformedBang[] = [];
	for (const bang of bangs) {
		// Skip unsupported bangs
		if (bang.x) {
			console.error(`[!] skipping unsupported bang !${bang.t} with url ${bang.u}`);
			continue;
		}

		if (bang.u.startsWith('/')) {
			continue;
		}

		// Skip Kagi-specific bangs
		try {
			const url = new URL(bang.u);
			if (url.hostname === 'kagi.com' || url.hostname.endsWith('.kagi.com')) {
				continue;
			}
		} catch {}

		const transformed = transformBang(bang, seen, extraTriggers);
		if (transformed) {
			strippedBangs.push(transformed);
		}
	}

	return [...strippedBangs, ...extraBangs];
};

const sort = (bangs: TransformedBang[]) => {
	return bangs.sort((a, b) => {
		const triggerA = a.ts[0];
		const triggerB = b.ts[0];
		return (triggerA.length - triggerB.length) || triggerA.localeCompare(triggerB);
	});
};

const generateBangs = async (): Promise<string> => {
	const data = await load();
	const transformed = transform(data);
	const sorted = sort(transformed);
	return JSON.stringify(sorted);
};

export const handleBangs = async (
	request: Request,
	env: { BANGS_KV?: KVNamespace }
): Promise<Response> => {
	const url = new URL(request.url);
	const forceRefresh = url.searchParams.has('refresh');

	try {
		// Try to get from KV cache first (unless refresh is requested)
		if (!forceRefresh && env.BANGS_KV) {
			const cached = await env.BANGS_KV.get(KV_KEY);
			if (cached) {
				return new Response(cached, {
					headers: {
						'Content-Type': 'application/json',
						'Cache-Control': 'public, max-age=3600',
						'X-Cache': 'HIT',
					},
				});
			}
		}

		// Generate fresh bangs
		const bangsJson = await generateBangs();

		// Store in KV for next time
		if (env.BANGS_KV) {
			await env.BANGS_KV.put(KV_KEY, bangsJson, {
				expirationTtl: CACHE_TTL,
			});
		}

		return new Response(bangsJson, {
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'public, max-age=3600',
				'X-Cache': 'MISS',
			},
		});
	} catch (error) {
		console.error('Error generating bangs:', error);
		return new Response('Error generating bangs', { status: 500 });
	}
};
