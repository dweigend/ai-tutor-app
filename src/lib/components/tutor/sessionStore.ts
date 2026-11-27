import type {
	ApiMode,
	TaskRef,
	TutorTurnRequest,
	TutorApiClient,
	TutorSession as SessionInfo
} from '$lib/api/types';
import type { DraftMode, ScriptCursor } from './script';
import type { LiveTurn, TranscriptEntry } from './types';

/**
 * A tutor session per scenario, kept across client-side navigation (e.g. a trip to the
 * whiteboard). Module scope only: a reload starts fresh. Bound to the client that ran the session,
 * because a different backend cannot continue it.
 */
export interface SavedSession {
	sessionId: string;
	revision: number;
	sessionState: SessionInfo['state'] | null;
	cursor: ScriptCursor;
	entries: TranscriptEntry[];
	/** Only an unconfirmed turn (aborted or failed); a running stream stops on leaving. */
	live: LiveTurn | null;
	draft: string;
	confidence: number | undefined;
	/** Free question by default; `answer` only after an explicit hand-in switch. */
	mode?: DraftMode;
	boundClient: TutorApiClient;
}

const sessions = new Map<string, SavedSession>();

export function loadSession(scenarioId: string, client: TutorApiClient): SavedSession | null {
	const saved = sessions.get(scenarioId);
	if (!saved) return null;
	if (saved.boundClient !== client) {
		sessions.delete(scenarioId);
		return null;
	}
	return saved;
}

export function saveSession(scenarioId: string, session: SavedSession): void {
	sessions.set(scenarioId, session);
}

export function clearSession(scenarioId: string): void {
	sessions.delete(scenarioId);
}

export function selectScenario<T extends { id: string; task?: { taskId: string } | null }>(
	scenarios: readonly T[],
	query: URLSearchParams,
	previous: string | null
) {
	const id = query.get('szenario') ?? query.get('scenario');
	return (
		scenarios.find((item) => item.id === id) ??
		scenarios.find((item) => item.task?.taskId === query.get('aufgabe')) ??
		scenarios.find((item) => item.id === previous) ??
		scenarios[0]
	);
}

/** Replayed requests may only commit once, at their original session revision. */
export function acceptsTurn(
	request: { requestId: string; sessionId: string; expectedRevision: number },
	response: { requestId: string; session: { id: string; revision: number } },
	activeId: string | undefined,
	currentRevision: number,
	aborted: boolean
) {
	return (
		!aborted &&
		activeId === request.requestId &&
		response.requestId === activeId &&
		response.session.id === request.sessionId &&
		currentRevision === request.expectedRevision &&
		response.session.revision === currentRevision + 1
	);
}

/** HTTP retries must replay exactly the context authorized for the original turn. */
export function requiresConsentRestart(
	request: TutorTurnRequest,
	mode: ApiMode,
	shareWithApi: boolean
) {
	return mode === 'http' && !!request.agentContext !== shareWithApi;
}

/** A confirmed tutor turn can precede the exercise or happen inside its companion sheet. */
export class ExerciseSessions {
	private active = new Map<string, string>();
	private attempts = new Map<string, { sessionId?: string }>();

	private key(task: TaskRef) {
		return JSON.stringify([task.courseId, task.courseVersion, task.taskId]);
	}

	start(task: TaskRef, sessionId: string) {
		const key = this.key(task);
		this.active.set(key, sessionId);
		const attempt = this.attempts.get(key);
		if (attempt) attempt.sessionId ??= sessionId;
	}
	close(task: TaskRef, sessionId: string) {
		const key = this.key(task);
		if (this.active.get(key) === sessionId) this.active.delete(key);
	}
	beginAttempt(task: TaskRef) {
		const key = this.key(task);
		const attempt = { sessionId: this.active.get(key) };
		this.attempts.set(key, attempt);
		return attempt;
	}
	reset(task: TaskRef) {
		const key = this.key(task);
		this.attempts.delete(key);
		this.active.delete(key);
	}
}
