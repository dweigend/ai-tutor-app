import * as publicEnv from '$env/static/public';
import { createContext } from 'svelte';
import { activityMirror as activityMirrorSeed, buildEditorialMockFixtures } from '$lib/content';
import { normalizeBaseUrl } from './http.js';
import { ApiError, HttpTutorClient, MockTutorClient, resolveTutorApiConfig } from './index.js';
import type { ApiConnectionConfig, ApiMode, TutorApiClient, WhiteboardSnapshot } from './types.js';

import { ExerciseSessions } from '../components/tutor/sessionStore';

const TODAY_TARGET = 12;

function localDayKey(value: Date | string): string {
	const date = typeof value === 'string' ? new Date(value) : value;
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${date.getFullYear()}-${month}-${day}`;
}

function createBlockedClient(message: string): TutorApiClient {
	const error = () => new ApiError({ code: 'unavailable', message, retryable: true });
	return {
		turn: () => Promise.reject(error()),
		async *streamTurn() {
			yield { type: 'error', problem: error().problem };
		},
		checkTutorial: () => Promise.reject(error()),
		evaluateExercise: () => Promise.reject(error()),
		getActivityMirror: () => Promise.reject(error()),
		health: () => Promise.reject(error())
	};
}

interface TutorAppContext {
	readonly client: TutorApiClient;
	readonly exerciseSessions: ExerciseSessions;
	readonly config: ApiConnectionConfig;
	readonly configError: string | null;
	readonly switching: boolean;
	shareWithApi: boolean;
	readonly todayDayKey: string;
	readonly todayCompleted: number;
	readonly todayTarget: number;
	resolveConfig(signal: AbortSignal): Promise<void>;
	switchMode(mode: ApiMode, baseUrl?: string): void;
	getPendingWhiteboard(scenarioId: string): WhiteboardSnapshot | null;
	setPendingWhiteboard(scenarioId: string, snapshot: WhiteboardSnapshot | null): void;
	getExerciseWhiteboard(taskId: string): WhiteboardSnapshot | null;
	setExerciseWhiteboard(taskId: string, snapshot: WhiteboardSnapshot | null): void;
	recordPracticeProgress(key?: string): void;
	syncCalendarDay(): void;
}

const [getTutorAppContext, setContext] = createContext<TutorAppContext>();
export { getTutorAppContext };

export function setTutorAppContext(): TutorAppContext {
	const demoClient = new MockTutorClient(buildEditorialMockFixtures());
	let exerciseSessions = $state.raw(new ExerciseSessions());
	let clientReady = false;
	let consentFor = $state.raw<TutorApiClient | null>(null);
	let connection = $state.raw<{ client: TutorApiClient; config: ApiConnectionConfig }>({
		client: createBlockedClient('Verbindung wird geladen.'),
		config: { mode: 'mock' }
	});
	let configError = $state<string | null>(null);
	let switching = $state(true);
	let pendingWhiteboards = $state.raw(new Map<string, WhiteboardSnapshot>());
	let exerciseWhiteboards = $state.raw(new Map<string, WhiteboardSnapshot>());
	let todayDayKey = $state(localDayKey(new Date()));
	let todayCompleted = $state(
		activityMirrorSeed.observations.filter(
			(observation) =>
				observation.kind === 'attempted' &&
				observation.outcome === 'korrekt' &&
				localDayKey(observation.recordedAt) === todayDayKey
		).length
	);
	const recordedProgressKeys = new Set<string>();
	let configRequested = false;
	let pendingConfigSignal: AbortSignal | undefined;
	let manuallySwitched = false;

	function connect(config: ApiConnectionConfig): void {
		if (clientReady && config.mode === connection.config.mode) {
			if (config.mode === 'mock') return;
			if (connection.config.mode === 'http' && config.baseUrl === connection.config.baseUrl) return;
		}
		exerciseSessions = new ExerciseSessions();
		consentFor = null;
		switch (config.mode) {
			case 'mock':
				connection = { config, client: demoClient };
				break;
			case 'http': {
				const client: HttpTutorClient = new HttpTutorClient(config.baseUrl, fetch, {
					get shareWithApi() {
						return consentFor === client;
					}
				});
				connection = { config, client };
				break;
			}
		}
		clientReady = true;
	}

	function showConfigError(error: unknown, blockSubmissions = false): void {
		const message =
			error instanceof ApiError ? error.problem.message : 'Verbindung fehlgeschlagen.';
		configError = message;
		if (blockSubmissions) {
			clientReady = false;
			connection = { config: connection.config, client: createBlockedClient(message) };
		}
	}

	function syncToday(): void {
		const currentDay = localDayKey(new Date());
		if (currentDay === todayDayKey) return;
		todayDayKey = currentDay;
		todayCompleted = 0;
		recordedProgressKeys.clear();
	}

	return setContext({
		get exerciseSessions() {
			return exerciseSessions;
		},
		get client() {
			return connection.client;
		},
		get config() {
			return connection.config;
		},
		get configError() {
			return configError;
		},
		get shareWithApi() {
			return consentFor === connection.client;
		},
		set shareWithApi(value) {
			consentFor = value && connection.config.mode === 'http' ? connection.client : null;
		},
		get switching() {
			return switching;
		},
		get todayDayKey() {
			return todayDayKey;
		},
		get todayCompleted() {
			return todayCompleted;
		},
		todayTarget: TODAY_TARGET,
		async resolveConfig(signal) {
			if (manuallySwitched || signal.aborted) return;
			if (configRequested && !pendingConfigSignal?.aborted) return;
			configRequested = true;
			pendingConfigSignal = signal;
			switching = true;
			try {
				// SvelteKit omits undeclared public variables from this module entirely.
				const entry: unknown = Object.getOwnPropertyDescriptor(
					publicEnv,
					'PUBLIC_TUTOR_API_URL'
				)?.value;
				const config = await resolveTutorApiConfig({
					buildApiUrl: typeof entry === 'string' ? entry : '',
					signal
				});
				if (!signal.aborted && !manuallySwitched) connect(config);
			} catch (error) {
				if (!signal.aborted && !manuallySwitched) showConfigError(error, true);
			} finally {
				if (pendingConfigSignal === signal) {
					pendingConfigSignal = undefined;
					if (signal.aborted) configRequested = false;
					else switching = false;
				}
			}
		},
		switchMode(mode, baseUrl) {
			configError = null;
			try {
				if (mode === 'http') {
					const raw = baseUrl?.trim() ?? '';
					const url = raw ? normalizeBaseUrl(raw) || '/' : '/';
					connect({ mode, baseUrl: url });
				} else {
					connect({ mode });
				}
				manuallySwitched = true;
				switching = false;
			} catch (error) {
				showConfigError(error);
			}
		},
		getPendingWhiteboard(scenarioId) {
			return pendingWhiteboards.get(scenarioId) ?? null;
		},
		setPendingWhiteboard(scenarioId, snapshot) {
			const next = new Map(pendingWhiteboards);
			if (snapshot) next.set(scenarioId, $state.snapshot(snapshot));
			else next.delete(scenarioId);
			pendingWhiteboards = next;
		},
		getExerciseWhiteboard(taskId) {
			return exerciseWhiteboards.get(taskId) ?? null;
		},
		setExerciseWhiteboard(taskId, snapshot) {
			const next = new Map(exerciseWhiteboards);
			if (snapshot) next.set(taskId, $state.snapshot(snapshot));
			else next.delete(taskId);
			exerciseWhiteboards = next;
		},
		recordPracticeProgress(key) {
			syncToday();
			if (key !== undefined) {
				const scopedKey = `${todayDayKey}:${key}`;
				if (recordedProgressKeys.has(scopedKey)) return;
				recordedProgressKeys.add(scopedKey);
			}
			todayCompleted += 1;
		},
		syncCalendarDay() {
			syncToday();
		}
	});
}
