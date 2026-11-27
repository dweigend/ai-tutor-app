import type {
	ApiMode,
	TutorMoveKind,
	LearningEvidence,
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

type HelpLevel = LearningEvidence['helpLevel'];

export function helpForMove(move: TutorMoveKind): HelpLevel {
	switch (move) {
		case 'kontrastfall':
			return 1;
		case 'gestufter_hinweis':
			return 2;
		case 'beispiel_zeigen':
			return 3;
		case 'kurz_erklaeren':
			return 4;
		default:
			return 0;
	}
}

class AttemptBinding {
	private readonly sessions = new Map<string, HelpLevel>();

	record(sessionId: string, level: HelpLevel) {
		const previous = this.sessions.get(sessionId);
		if (previous === undefined || previous < level) this.sessions.set(sessionId, level);
	}

	get sessionId() {
		let selected: string | undefined;
		let highest = -1;
		// Map iteration follows first observation. On ties the later session wins.
		for (const [id, level] of this.sessions) {
			if (level >= highest) {
				selected = id;
				highest = level;
			}
		}
		return selected;
	}
}

export class ExerciseSessions {
	private active = new Map<string, { id: string; level: HelpLevel }>();
	private attempts = new Map<string, AttemptBinding>();

	private key(task: TaskRef) {
		return JSON.stringify([task.courseId, task.courseVersion, task.taskId]);
	}

	start(task: TaskRef, sessionId: string) {
		this.recordHelp(task, sessionId, 0);
	}

	recordHelp(task: TaskRef, sessionId: string, level: HelpLevel) {
		const key = this.key(task);
		const active = this.active.get(key);
		if (active?.id !== sessionId || active.level < level)
			this.active.set(key, { id: sessionId, level });
		this.attempts.get(key)?.record(sessionId, level);
	}

	close(task: TaskRef, sessionId: string) {
		const key = this.key(task);
		if (this.active.get(key)?.id === sessionId) this.active.delete(key);
	}

	beginAttempt(task: TaskRef) {
		const key = this.key(task);
		let attempt = this.attempts.get(key);
		if (!attempt) {
			attempt = new AttemptBinding();
			const active = this.active.get(key);
			if (active) attempt.record(active.id, active.level);
			this.attempts.set(key, attempt);
		}
		const binding = attempt;
		return {
			get sessionId() {
				return binding.sessionId;
			}
		};
	}

	reset(task: TaskRef) {
		const key = this.key(task);
		this.attempts.delete(key);
		this.active.delete(key);
	}
}
