import type { ApiConnectionConfig } from './types.js';

export function parseMediaUrl(value: string, appOrigin: string): URL | null {
	try {
		const url = new URL(value, appOrigin);
		if ((url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password)
			return url;
	} catch {
		// Invalid URL.
	}
	return null;
}

/** Only the app and its configured tutor service may supply automatically loaded images. */
export function trustedMediaUrl(value: string, appOrigin: string, config: ApiConnectionConfig) {
	const url = parseMediaUrl(value, appOrigin);
	if (!url) return null;
	if (url.origin === appOrigin) return url.href;
	const tutor = config.mode === 'http' ? parseMediaUrl(config.baseUrl, appOrigin) : null;
	return url.origin === tutor?.origin ? url.href : null;
}

/** The `fetch` shape the image loader needs; tests pass their own. */
export type MediaFetch = (input: string, init: RequestInit) => Promise<Response>;

/** Request options for a transcript image: never follow a redirect, no foreign cookies. */
export function mediaRequestInit(signal?: AbortSignal): RequestInit {
	return { redirect: 'error', credentials: 'same-origin', signal };
}

/**
 * Loads a trusted transcript image as a Blob. An `<img>` would follow an HTTP 3xx to any host;
 * this request fails on the first redirect instead, so a trusted origin can never hand the
 * browser on to a third party. Any error, redirect or non-image answer yields null.
 */
export async function loadTrustedImage(
	url: string,
	signal?: AbortSignal,
	fetcher: MediaFetch = (input, init) => fetch(input, init)
): Promise<Blob | null> {
	try {
		const response = await fetcher(url, mediaRequestInit(signal));
		if (!response.ok || response.redirected || response.type === 'opaqueredirect') return null;
		const blob = await response.blob();
		return blob.type.startsWith('image/') ? blob : null;
	} catch {
		return null;
	}
}
