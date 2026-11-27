import type { AgentContextSnapshot } from '../memory/types.js';

export type { AgentContextSnapshot };

export type TutorMoveKind =
	| 'warten'
	| 'nachhaken'
	| 'paraphrasieren'
	| 'vorhersage_verlangen'
	| 'kontrastfall'
	| 'gestufter_hinweis'
	| 'kurz_erklaeren'
	| 'beispiel_zeigen'
	| 'zurueckerklaeren_lassen'
	| 'abruf_pruefen'
	| 'transfer_stellen'
	| 'interesse_erfragen'
	| 'routine_vorschlagen'
	| 'pause_anbieten'
	| 'abschliessen';

export type CourseRef = { courseId: string; courseVersion: string };
export type TaskRef = CourseRef & { taskId: string };
/**
 * What a check says about one attempt. `nicht_pruefbar_oder_alternativweg` is the fourth evidence
 * state: a sketch or a free alternative way was received, but no automatic rule can judge it. It is
 * neither partial nor correct; it never counts as mastery and never carries learning evidence.
 */
export type CheckResult = 'korrekt' | 'teilweise' | 'falsch' | 'nicht_pruefbar_oder_alternativweg';

/** All check results in contract order; HTTP validation and tests read this list. */
export const CHECK_RESULTS = [
	'korrekt',
	'teilweise',
	'falsch',
	'nicht_pruefbar_oder_alternativweg'
] as const satisfies readonly CheckResult[];

/**
 * Four-level evidence the live backend may send next to `result`. When present it is authoritative:
 * `nicht_pruefbar_oder_alternativweg` stays neutral even if a legacy `result` says `teilweise`.
 */
export type EvidenceLevel =
	'geprueft_korrekt' | 'teilwissen' | 'nicht_pruefbar_oder_alternativweg' | 'nachgewiesener_fehler';

export const EVIDENCE_LEVELS = [
	'geprueft_korrekt',
	'teilwissen',
	'nicht_pruefbar_oder_alternativweg',
	'nachgewiesener_fehler'
] as const satisfies readonly EvidenceLevel[];

const RESULT_OF_LEVEL: Record<EvidenceLevel, CheckResult> = {
	geprueft_korrekt: 'korrekt',
	teilwissen: 'teilweise',
	nicht_pruefbar_oder_alternativweg: 'nicht_pruefbar_oder_alternativweg',
	nachgewiesener_fehler: 'falsch'
};

/** The check result an attempt stands for; a sent evidence level wins over the legacy result. */
export function effectiveResult(result: CheckResult, evidenceLevel?: EvidenceLevel): CheckResult {
	return evidenceLevel ? RESULT_OF_LEVEL[evidenceLevel] : result;
}

/** Only `korrekt` is mastery evidence; the other three results never are. */
export function countsAsMastery(result: CheckResult): boolean {
	return result === 'korrekt';
}
export type EvidenceKind = 'abruf' | 'vorhersage' | 'anwendung' | 'fehlerfund' | 'transfer';

export interface WhiteboardSnapshot {
	boardId: string;
	revision: number;
	strokes: { points: { x: number; y: number }[] }[];
}

export type TutorInput =
	| { kind: 'message'; text: string }
	| { kind: 'answer'; text: string; confidence?: number }
	| { kind: 'explain' }
	| { kind: 'whiteboard'; snapshot: WhiteboardSnapshot; text?: string };

export type TutorMessage =
	| {
			id: string;
			role: 'learner';
			text: string;
			attachment?: { boardId: string; revision: number };
	  }
	| {
			id: string;
			role: 'tutor';
			text: string;
			move: Exclude<TutorMoveKind, 'warten'>;
			media: { id: string; url: string; alt: string }[];
	  };

export interface TutorSession {
	id: string;
	task: TaskRef | null;
	course?: CourseRef;
	revision: number;
	state: { attempts: number; hintsRemaining: number; explanationAvailable: boolean };
}

export type TutorScope = { task: TaskRef; course?: CourseRef } | { course: CourseRef; task?: null };

export function tutorScope(scope: TutorScope): TutorScope {
	return scope.task ? { task: scope.task } : { course: scope.course };
}

export function matchesTutorScope(session: TutorSession, request: TutorScope): boolean {
	if (session.course && !sameCourse(session.course, request.task ? request.task : request.course))
		return false;
	return request.task
		? !!session.task && sameTask(session.task, request.task)
		: session.task === null;
}

export type TutorTurnRequest = TutorScope & {
	sessionId: string;
	expectedRevision: number;
	requestId: string;
	input: TutorInput;
	agentContext?: AgentContextSnapshot;
};

type ArtifactHeader = { id: string; title: string };
export type Formula = ArtifactHeader & {
	kind: 'formula';
	latex: string;
	spoken: string;
	caption?: string;
};
export type Code = ArtifactHeader & {
	kind: 'code';
	language: string;
	code: string;
	caption?: string;
};
export type Sketch = ArtifactHeader & {
	kind: 'sketch';
	points: { x: number; y: number }[][];
	caption?: string;
};
export type Question = ArtifactHeader & { kind: 'question'; prompt: string; choices?: string[] };
export type TutorArtifact = Formula | Code | Sketch | Question;

export type TutorTurnResponse = {
	requestId: string;
	session: TutorSession;
	learnerMessage: Extract<TutorMessage, { role: 'learner' }> | null;
} & (
	| {
			outcome: 'reply';
			message: Extract<TutorMessage, { role: 'tutor' }>;
			artifact?: TutorArtifact;
	  }
	| { outcome: 'wait'; message: null; artifact?: never }
);

export interface ApiProblem {
	code:
		| 'invalid_input'
		| 'unauthorized'
		| 'not_found'
		| 'conflict'
		| 'unavailable'
		| 'network'
		| 'protocol';
	message: string;
	retryable: boolean;
}

export type StreamEvent =
	| { type: 'delta'; text: string }
	| { type: 'done'; response: TutorTurnResponse }
	| { type: 'error'; problem: ApiProblem };

export interface TutorialCheckRequest {
	kind: 'tutorial';
	requestId: string;
	course: CourseRef;
	tutorialId: string;
	checkId: string;
	answer: { kind: 'text'; text: string } | { kind: 'choice'; optionIds: string[] };
}

export interface ExerciseAttemptRequest {
	stepId?: 'abruf' | 'kursaufgabe';
	sessionId?: string;
	kind: 'exercise';
	requestId: string;
	task: TaskRef;
	answer:
		| TutorialCheckRequest['answer']
		| { kind: 'code'; source: string }
		| { kind: 'order'; itemIds: string[] }
		| { kind: 'whiteboard'; snapshot: WhiteboardSnapshot };
	confidence?: number;
}

export interface TutorialCheckResponse {
	kind: 'tutorial';
	requestId: string;
	result: CheckResult;
	evidenceLevel?: EvidenceLevel;
	feedback: string;
}

export type EvidenceScope = 'vollstaendig' | 'teilaspekt';

export interface LearningEvidence {
	evidenceScope?: EvidenceScope;
	evidenceLevel?: EvidenceLevel;
	result?: CheckResult;
	id: string;
	attemptId?: string;
	taskId: string;
	learningGoalId: string;
	kind: EvidenceKind;
	helpLevel: 0 | 1 | 2 | 3 | 4;
	recordedAt: string;
}

/** Same moment, whatever the notation: `…Z` and `…+00:00` are one time. */
function sameTime(left: string, right: string): boolean {
	const a = Date.parse(left);
	return Number.isFinite(a) && a === Date.parse(right);
}

/**
 * The attempts a piece of evidence can belong to: the one its `attemptId` names; without one, the
 * attempt its own ID starts with (`<attemptId>:1`); for older evidence the same recorded time.
 */
export function evidenceAttemptId(
	item: LearningEvidence,
	recentPractice: readonly Pick<
		ActivityMirrorSnapshot['recentPractice'][number],
		'id' | 'itemId' | 'recordedAt'
	>[]
): string | undefined {
	const sameTask = recentPractice.filter((practice) => practice.itemId === item.taskId);
	if (item.attemptId) return sameTask.find((practice) => practice.id === item.attemptId)?.id;
	const byPrefix = sameTask.filter((practice) => item.id.startsWith(practice.id + ':'));
	const matches = byPrefix.length
		? byPrefix
		: sameTask.filter((practice) => sameTime(practice.recordedAt, item.recordedAt));
	return matches.length === 1 ? matches[0].id : undefined;
}

export interface ExerciseAttemptResponse {
	evidenceScope?: EvidenceScope;
	kind: 'exercise';
	requestId: string;
	attemptId: string;
	result: CheckResult;
	evidenceLevel?: EvidenceLevel;
	feedback: string;
	evidence: LearningEvidence[];
}

export interface ActivityMirrorSnapshot {
	course: CourseRef;
	recentPractice: {
		kind: 'tutorial' | 'exercise';
		id: string;
		itemId: string;
		learningGoalId?: string;
		helpLevel?: LearningEvidence['helpLevel'];
		evidenceScope?: EvidenceScope;
		result: CheckResult;
		evidenceLevel?: EvidenceLevel;
		recordedAt: string;
	}[];
	evidence: LearningEvidence[];
}

export interface TutorApiClient {
	turn(request: TutorTurnRequest, signal?: AbortSignal): Promise<TutorTurnResponse>;
	streamTurn(request: TutorTurnRequest, signal?: AbortSignal): AsyncIterable<StreamEvent>;
	checkTutorial(
		request: TutorialCheckRequest,
		signal?: AbortSignal
	): Promise<TutorialCheckResponse>;
	evaluateExercise(
		request: ExerciseAttemptRequest,
		signal?: AbortSignal
	): Promise<ExerciseAttemptResponse>;
	getActivityMirror(course: CourseRef, signal?: AbortSignal): Promise<ActivityMirrorSnapshot>;
	health(signal?: AbortSignal): Promise<{ status: 'ok'; apiVersion: 'v1' }>;
}

export type ApiMode = 'mock' | 'http';

export type ApiConnectionConfig =
	| { mode: 'mock' }
	| {
			mode: 'http';
			baseUrl: string;
			shareWithApi?: boolean;
	  };

export class ApiError extends Error {
	readonly problem: ApiProblem;
	readonly status?: number;

	constructor(problem: ApiProblem, status?: number) {
		super(problem.message);
		this.name = 'ApiError';
		this.problem = problem;
		this.status = status;
	}
}

const MAX_WHITEBOARD_POINTS = 5_000;

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isId(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

export function isRevision(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isCoordinate(value: unknown): value is number {
	return typeof value === 'number' && value >= 0 && value <= 1;
}

export function isSketchPoints(value: unknown): value is Sketch['points'] {
	if (!Array.isArray(value) || value.length === 0) return false;
	let points = 0;
	for (const stroke of value as unknown[]) {
		if (!Array.isArray(stroke) || stroke.length === 0) return false;
		points += stroke.length;
		if (points > MAX_WHITEBOARD_POINTS) return false;
		for (const point of stroke as unknown[]) {
			if (!isRecord(point) || !isCoordinate(point.x) || !isCoordinate(point.y)) return false;
		}
	}
	return true;
}

export function isTutorArtifact(value: unknown): value is TutorArtifact {
	if (!isRecord(value) || !isId(value.id) || !isId(value.title)) return false;
	if (value.caption !== undefined && typeof value.caption !== 'string') return false;
	switch (value.kind) {
		case 'formula':
			return isId(value.latex) && isId(value.spoken);
		case 'code':
			return isId(value.language) && isId(value.code);
		case 'sketch':
			return isSketchPoints(value.points);
		case 'question':
			return (
				isId(value.prompt) &&
				(value.choices === undefined ||
					(Array.isArray(value.choices) && Array.from(value.choices).every(isId)))
			);
		default:
			return false;
	}
}

export function isWhiteboardSnapshot(value: unknown): value is WhiteboardSnapshot {
	if (!isRecord(value) || !isId(value.boardId) || !isRevision(value.revision)) return false;
	if (!Array.isArray(value.strokes) || value.strokes.length === 0) return false;

	const strokes: unknown[] = value.strokes;
	if (strokes.length > MAX_WHITEBOARD_POINTS) return false;
	return isSketchPoints(strokes.map((stroke) => (isRecord(stroke) ? stroke.points : undefined)));
}

export function sameCourse(left: CourseRef, right: CourseRef): boolean {
	return left.courseId === right.courseId && left.courseVersion === right.courseVersion;
}

export function sameTask(left: TaskRef, right: TaskRef): boolean {
	return sameCourse(left, right) && left.taskId === right.taskId;
}

export function checkAbort(signal?: AbortSignal): void {
	if (signal?.aborted) throw new DOMException('Die Anfrage wurde abgebrochen.', 'AbortError');
}
