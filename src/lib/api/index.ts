import { HttpTutorClient, normalizeBaseUrl } from './http.js';
import { MockTutorClient } from './mock.js';
import type { MockFixtures } from './mock.js';
import { ApiError, checkAbort, isRecord } from './types.js';
import type { ApiConnectionConfig, ApiMode, TutorApiClient } from './types.js';

export * from './types.js';
export { HttpTutorClient, MockTutorClient };
export type { HttpTutorClientOptions } from './http.js';
export type { MockFixtures };

export function createTutorApiClient(
	config: ApiConnectionConfig,
	fixtures?: MockFixtures,
	fetcher?: typeof fetch
): TutorApiClient {
	return config.mode === 'http'
		? new HttpTutorClient(config.baseUrl, fetcher, { shareWithApi: config.shareWithApi })
		: new MockTutorClient(fixtures);
}

interface ConfigOptions {
	buildApiUrl?: string;
	configUrl?: string;
	fetcher?: typeof fetch;
	signal?: AbortSignal;
}

function configError(message: string, status?: number): ApiError {
	return new ApiError({ code: 'protocol', message, retryable: false }, status);
}

function liveConfig(baseUrl: string): ApiConnectionConfig {
	const trimmed = baseUrl.trim();
	return { mode: 'http', baseUrl: trimmed && trimmed !== '/' ? normalizeBaseUrl(trimmed) : '/' };
}

async function readRuntimeConfig(
	response: Response,
	signal?: AbortSignal
): Promise<ApiConnectionConfig> {
	let value: unknown;
	try {
		value = await response.json();
	} catch {
		checkAbort(signal);
		throw configError('tutor-config.json enthält ungültiges JSON.', response.status);
	}
	checkAbort(signal);
	if (isRecord(value) && value.mode === 'mock') return { mode: 'mock' };
	if (isRecord(value) && value.mode === 'http' && typeof value.baseUrl === 'string') {
		return liveConfig(value.baseUrl);
	}
	throw configError(
		'tutor-config.json braucht einen gültigen Demo- oder Live-Modus.',
		response.status
	);
}

export async function resolveTutorApiConfig({
	buildApiUrl = '',
	configUrl = '/tutor-config.json',
	fetcher = globalThis.fetch,
	signal
}: ConfigOptions = {}): Promise<ApiConnectionConfig> {
	checkAbort(signal);
	let response: Response;
	try {
		response = await fetcher(configUrl, { cache: 'no-store', signal });
	} catch {
		checkAbort(signal);
		throw new ApiError({
			code: 'network',
			message: 'tutor-config.json konnte nicht geladen werden.',
			retryable: true
		});
	}

	checkAbort(signal);
	if (response.ok) return readRuntimeConfig(response, signal);
	if (response.status !== 404) {
		throw configError('tutor-config.json konnte nicht geladen werden.', response.status);
	}

	const baseUrl = buildApiUrl.trim();
	checkAbort(signal);
	return baseUrl ? liveConfig(baseUrl) : { mode: 'mock' };
}

export interface ActiveTutorApiConnection {
	config: ApiConnectionConfig;
	client: TutorApiClient;
	liveBaseUrl?: string;
}

// A changed backend needs a new session ID and a fresh confirmed transcript in the UI.
export function switchTutorApiMode(
	current: ActiveTutorApiConnection,
	mode: ApiMode,
	fixtures?: MockFixtures
): ActiveTutorApiConnection {
	if (mode === current.config.mode) return current;

	const liveBaseUrl = current.config.mode === 'http' ? current.config.baseUrl : current.liveBaseUrl;
	const config = mode === 'http' ? liveConfig(liveBaseUrl ?? '/') : { mode: 'mock' as const };
	return { config, client: createTutorApiClient(config, fixtures), liveBaseUrl };
}
