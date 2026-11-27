import { INDEPENDENT_PROBE_HELP, isProtectedTutorTurn } from '../memory/screen-context.js';
import { parseMediaUrl } from './media.js';
import {
	ApiError,
	CHECK_RESULTS,
	EVIDENCE_LEVELS,
	countsAsMastery,
	evidenceAttemptId,
	checkAbort,
	effectiveResult,
	isId,
	isRecord,
	isRevision,
	isTutorArtifact,
	sameCourse,
	sameTask
} from './types.js';
import type {
	ActivityMirrorSnapshot,
	ApiProblem,
	CheckResult,
	EvidenceLevel,
	CourseRef,
	ExerciseAttemptRequest,
	ExerciseAttemptResponse,
	LearningEvidence,
	StreamEvent,
	TaskRef,
	TutorApiClient,
	TutorMessage,
	TutorTurnRequest,
	TutorTurnResponse,
	TutorialCheckRequest,
	TutorialCheckResponse
} from './types.js';

const PROBLEM_CODES = [
	'invalid_input',
	'unauthorized',
	'not_found',
	'conflict',
	'unavailable',
	'network',
	'protocol'
] as const;
const REPLY_MOVES = [
	'nachhaken',
	'paraphrasieren',
	'vorhersage_verlangen',
	'kontrastfall',
	'gestufter_hinweis',
	'kurz_erklaeren',
	'beispiel_zeigen',
	'zurueckerklaeren_lassen',
	'abruf_pruefen',
	'transfer_stellen',
	'interesse_erfragen',
	'routine_vorschlagen',
	'pause_anbieten',
	'abschliessen'
] as const;
const EVIDENCE_KINDS = ['vorhersage', 'anwendung', 'fehlerfund', 'transfer'] as const;

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
	return options.some((option) => value === option);
}

function isList<T>(value: unknown, check: (item: unknown) => item is T): value is T[] {
	return Array.isArray(value) && value.every(check);
}

function isCourse(value: unknown): value is CourseRef {
	return isRecord(value) && isId(value.courseId) && isId(value.courseVersion);
}

function isTask(value: unknown): value is TaskRef {
	return isRecord(value) && isId(value.taskId) && isCourse(value);
}

function isUtcDate(value: unknown): value is string {
	if (
		typeof value !== 'string' ||
		!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|\+00:00)$/.test(value)
	) {
		return false;
	}
	const milliseconds = Date.parse(value);
	return (
		Number.isFinite(milliseconds) &&
		new Date(milliseconds).toISOString().slice(0, 19) === value.slice(0, 19)
	);
}

function isEvidence(value: unknown): value is LearningEvidence {
	return (
		isRecord(value) &&
		isId(value.id) &&
		(value.attemptId === undefined || isId(value.attemptId)) &&
		isId(value.taskId) &&
		isId(value.learningGoalId) &&
		isOptionalLevel(value.evidenceLevel) &&
		(value.result === undefined || isOneOf(value.result, CHECK_RESULTS)) &&
		isOneOf(value.kind, EVIDENCE_KINDS) &&
		isRevision(value.helpLevel) &&
		value.helpLevel <= 4 &&
		isUtcDate(value.recordedAt)
	);
}

function isOptionalLevel(value: unknown): boolean {
	return value === undefined || isOneOf(value, EVIDENCE_LEVELS);
}

/** Applies a sent evidence level to `result`, so every consumer sees one consistent state. */
function withEffectiveResult<T extends { result: CheckResult; evidenceLevel?: EvidenceLevel }>(
	value: T
): T {
	return { ...value, result: effectiveResult(value.result, value.evidenceLevel) };
}

function isPractice(value: unknown): value is ActivityMirrorSnapshot['recentPractice'][number] {
	return (
		isRecord(value) &&
		(value.kind === 'tutorial' || value.kind === 'exercise') &&
		isId(value.id) &&
		isId(value.itemId) &&
		isOneOf(value.result, CHECK_RESULTS) &&
		isOptionalLevel(value.evidenceLevel) &&
		isUtcDate(value.recordedAt)
	);
}

function isMirror(value: unknown): value is ActivityMirrorSnapshot {
	return (
		isRecord(value) &&
		isCourse(value.course) &&
		isList(value.recentPractice, isPractice) &&
		isList(value.evidence, isEvidence)
	);
}

function isTutorialCheck(value: unknown): value is TutorialCheckResponse {
	return (
		isRecord(value) &&
		value.kind === 'tutorial' &&
		isId(value.requestId) &&
		isOneOf(value.result, CHECK_RESULTS) &&
		isOptionalLevel(value.evidenceLevel) &&
		isId(value.feedback)
	);
}

function isExerciseAttempt(value: unknown): value is ExerciseAttemptResponse {
	return (
		isRecord(value) &&
		value.kind === 'exercise' &&
		isId(value.requestId) &&
		isId(value.attemptId) &&
		isOneOf(value.result, CHECK_RESULTS) &&
		isOptionalLevel(value.evidenceLevel) &&
		isId(value.feedback) &&
		isList(value.evidence, isEvidence)
	);
}

function isProblem(value: unknown): value is ApiProblem {
	return (
		isRecord(value) &&
		isOneOf(value.code, PROBLEM_CODES) &&
		isId(value.message) &&
		typeof value.retryable === 'boolean'
	);
}

type LearnerMessage = Extract<TutorMessage, { role: 'learner' }>;
type TutorReply = Extract<TutorMessage, { role: 'tutor' }>;

function isLearnerMessage(value: unknown): value is LearnerMessage {
	if (
		!isRecord(value) ||
		value.role !== 'learner' ||
		!isId(value.id) ||
		typeof value.text !== 'string'
	)
		return false;
	const attachment = value.attachment;
	return (
		attachment === undefined ||
		(isRecord(attachment) && isId(attachment.boardId) && isRevision(attachment.revision))
	);
}

function isMedia(value: unknown): value is TutorReply['media'][number] {
	if (!isRecord(value) || !isId(value.id) || !isId(value.url) || typeof value.alt !== 'string')
		return false;
	// The transcript applies the current app and tutor origin policy before loading.
	return (
		parseMediaUrl(value.url, globalThis.location?.origin ?? 'http://tutor-ui.invalid') !== null
	);
}

function isReply(value: unknown): value is TutorReply {
	return (
		isRecord(value) &&
		value.role === 'tutor' &&
		isId(value.id) &&
		isId(value.text) &&
		isOneOf(value.move, REPLY_MOVES) &&
		isList(value.media, isMedia)
	);
}

function isSession(value: unknown): value is TutorTurnResponse['session'] {
	if (!isRecord(value) || !isId(value.id) || !isTask(value.task) || !isRevision(value.revision))
		return false;
	const state = value.state;
	return (
		isRecord(state) &&
		isRevision(state.attempts) &&
		isRevision(state.hintsRemaining) &&
		typeof state.explanationAvailable === 'boolean'
	);
}

function isTurn(value: unknown): value is TutorTurnResponse {
	if (
		!isRecord(value) ||
		!isId(value.requestId) ||
		!isSession(value.session) ||
		(value.learnerMessage !== null && !isLearnerMessage(value.learnerMessage))
	)
		return false;
	return (
		(value.outcome === 'reply' &&
			isReply(value.message) &&
			(value.artifact === undefined || isTutorArtifact(value.artifact))) ||
		(value.outcome === 'wait' && value.message === null && value.artifact === undefined)
	);
}

function matchesTurn(response: TutorTurnResponse, request: TutorTurnRequest): boolean {
	const { session, learnerMessage } = response;
	if (
		response.requestId !== request.requestId ||
		session.id !== request.sessionId ||
		session.revision !== request.expectedRevision + 1 ||
		!sameTask(session.task, request.task)
	)
		return false;

	if (request.input.kind === 'explain') return !learnerMessage?.attachment;
	if (learnerMessage === null) return false;
	if (request.input.kind !== 'whiteboard') return learnerMessage.attachment === undefined;
	return (
		learnerMessage.attachment?.boardId === request.input.snapshot.boardId &&
		learnerMessage.attachment.revision === request.input.snapshot.revision
	);
}

function protocol(message: string, status?: number): ApiError {
	return new ApiError({ code: 'protocol', message, retryable: false }, status);
}

function transportError(error: unknown, signal?: AbortSignal): ApiError {
	checkAbort(signal);
	if (error instanceof DOMException && error.name === 'AbortError') throw error;
	if (error instanceof ApiError) return error;
	return new ApiError({
		code: 'network',
		message: 'Der Tutordienst ist nicht erreichbar.',
		retryable: true
	});
}

function parseJson(text: string, status?: number): unknown {
	try {
		return JSON.parse(text);
	} catch {
		throw protocol('Der Tutordienst hat ungültiges JSON gesendet.', status);
	}
}

function requireType(condition: boolean): asserts condition {
	if (!condition) throw protocol('Die Antwort des Tutordienstes entspricht nicht dem API-Vertrag.');
}

function parseEvent(name: string, data: string): StreamEvent {
	const value = parseJson(data);
	if (isRecord(value) && name === value.type) {
		if (name === 'delta' && typeof value.text === 'string' && value.text.length > 0) {
			return { type: 'delta', text: value.text };
		}
		if (name === 'done' && isTurn(value.response))
			return { type: 'done', response: value.response };
		if (name === 'error' && isProblem(value.problem))
			return { type: 'error', problem: value.problem };
	}
	throw protocol('Der Tutordienst hat ein ungültiges Stream-Ereignis gesendet.');
}

class SseParser {
	private buffer = '';
	private skipLeadingLf = false;
	private name = '';
	private data: string[] = [];

	*push(chunk: string, eof = false): Iterable<StreamEvent> {
		if (this.skipLeadingLf && chunk.length > 0) {
			if (chunk.startsWith('\n')) chunk = chunk.slice(1);
			this.skipLeadingLf = false;
		}
		this.buffer += chunk;
		const newline = /\r\n|\r|\n/g;
		for (const match of this.buffer.matchAll(newline)) {
			const end = match.index + match[0].length;
			// Accept CR immediately and consume a split CRLF as a single newline.
			this.skipLeadingLf = match[0] === '\r' && end === this.buffer.length;
			const event = this.acceptLine(this.buffer.slice(newline.lastIndex, match.index));
			newline.lastIndex = end;
			if (event) yield event;
		}
		this.buffer = this.buffer.slice(newline.lastIndex);
		if (eof && (this.buffer.length > 0 || this.data.length > 0 || this.name)) {
			throw protocol('Der Tutordienst hat ein Stream-Ereignis nicht abgeschlossen.');
		}
	}

	private acceptLine(line: string): StreamEvent | undefined {
		if (line === '') {
			const event = this.data.length ? parseEvent(this.name, this.data.join('\n')) : undefined;
			this.data = [];
			this.name = '';
			return event;
		}

		const separator = line.indexOf(':');
		const field = separator < 0 ? line : line.slice(0, separator);
		const rawValue = separator < 0 ? '' : line.slice(separator + 1);
		const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue;
		if (field === 'event') this.name = value;
		if (field === 'data') this.data.push(value);
	}
}

function decodeChunk(decoder: TextDecoder, chunk?: Uint8Array): string {
	try {
		return decoder.decode(chunk, { stream: chunk !== undefined });
	} catch {
		throw protocol('Der Tutordienst hat ungültiges UTF-8 gesendet.');
	}
}

async function* readEvents(
	body: ReadableStream<Uint8Array>,
	signal?: AbortSignal
): AsyncIterable<StreamEvent> {
	const reader = body.getReader();
	const decoder = new TextDecoder('utf-8', { fatal: true });
	const parser = new SseParser();
	try {
		while (true) {
			checkAbort(signal);
			const { value, done } = await reader.read();
			checkAbort(signal);
			yield* parser.push(decodeChunk(decoder, value), done);
			if (done) return;
		}
	} finally {
		reader.cancel().catch(() => undefined);
		reader.releaseLock();
	}
}

export function normalizeBaseUrl(value: string): string {
	if (value === '/') return '';
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new ApiError({
			code: 'invalid_input',
			message: 'Die API-Basis-URL ist ungültig.',
			retryable: false
		});
	}
	if (
		!isOneOf(url.protocol, ['http:', 'https:']) ||
		url.username ||
		url.password ||
		url.search ||
		url.hash
	) {
		throw new ApiError({
			code: 'invalid_input',
			message: 'Die API-Basis-URL ist ungültig.',
			retryable: false
		});
	}
	return url.href.replace(/\/+$/, '');
}

export interface HttpTutorClientOptions {
	shareWithApi?: boolean;
}

export class HttpTutorClient implements TutorApiClient {
	private readonly root: string;
	private readonly fetcher: typeof fetch;
	private readonly options: HttpTutorClientOptions;

	constructor(
		baseUrl: string,
		fetcher: typeof fetch = globalThis.fetch,
		options: HttpTutorClientOptions = {}
	) {
		this.root = `${normalizeBaseUrl(baseUrl)}/api/v1`;
		this.fetcher = fetcher;
		this.options = options;
	}

	private prepareTurn(request: TutorTurnRequest, signal?: AbortSignal): TutorTurnRequest {
		checkAbort(signal);
		const { agentContext, ...body } = request;
		if (isProtectedTutorTurn(body.task, agentContext?.visibleScreen)) {
			throw new ApiError({
				code: 'unavailable',
				message: INDEPENDENT_PROBE_HELP,
				retryable: false
			});
		}
		return structuredClone(
			this.options.shareWithApi === true && agentContext ? { ...body, agentContext } : body
		);
	}

	private async fetchResponse(
		path: string,
		signal?: AbortSignal,
		body?: object,
		accept = 'application/json'
	) {
		checkAbort(signal);
		const headers = new Headers({ Accept: accept });
		if (body) headers.set('Content-Type', 'application/json');
		const init: RequestInit = { credentials: 'include', signal, headers };
		if (body) {
			init.method = 'POST';
			init.body = JSON.stringify(body);
		}
		const fetcher = this.fetcher;
		const response = await fetcher(`${this.root}${path}`, init);
		checkAbort(signal);
		if (response.ok) return response;

		const value = parseJson(await response.text(), response.status);
		checkAbort(signal);
		if (isRecord(value) && isProblem(value.problem))
			throw new ApiError(value.problem, response.status);
		throw protocol('Der Tutordienst hat einen ungültigen Fehler gesendet.', response.status);
	}

	private async json(path: string, signal?: AbortSignal, body?: object): Promise<unknown> {
		try {
			const response = await this.fetchResponse(path, signal, body);
			const raw = await response.text();
			checkAbort(signal);
			return parseJson(raw, response.status);
		} catch (error) {
			throw transportError(error, signal);
		}
	}

	async turn(request: TutorTurnRequest, signal?: AbortSignal): Promise<TutorTurnResponse> {
		const sentRequest = this.prepareTurn(request, signal);
		const value = await this.json('/tutor/turn', signal, sentRequest);
		requireType(isTurn(value) && matchesTurn(value, sentRequest));
		return value;
	}

	async *streamTurn(request: TutorTurnRequest, signal?: AbortSignal): AsyncIterable<StreamEvent> {
		let terminal: Exclude<StreamEvent, { type: 'delta' }> | undefined;
		try {
			const sentRequest = this.prepareTurn(request, signal);
			const response = await this.fetchResponse(
				'/tutor/stream',
				signal,
				sentRequest,
				'text/event-stream'
			);
			const mime = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
			requireType(mime === 'text/event-stream' && response.body !== null);

			let assembled = '';
			for await (const event of readEvents(response.body, signal)) {
				checkAbort(signal);
				if (event.type === 'delta') {
					assembled += event.text;
					yield event;
					continue;
				}
				if (event.type === 'done') {
					requireType(
						matchesTurn(event.response, sentRequest) &&
							assembled === (event.response.message?.text ?? '')
					);
				}
				terminal = event;
				break;
			}
			requireType(terminal !== undefined);
		} catch (error) {
			terminal = { type: 'error', problem: transportError(error, signal).problem };
		}
		checkAbort(signal);
		yield terminal;
	}

	async checkTutorial(
		request: TutorialCheckRequest,
		signal?: AbortSignal
	): Promise<TutorialCheckResponse> {
		const expectedRequestId = request.requestId;
		const value = await this.json('/exercises/evaluate', signal, request);
		requireType(isTutorialCheck(value) && value.requestId === expectedRequestId);
		return withEffectiveResult(value);
	}

	async evaluateExercise(
		request: ExerciseAttemptRequest,
		signal?: AbortSignal
	): Promise<ExerciseAttemptResponse> {
		const expectedRequestId = request.requestId;
		const expectedTaskId = request.task.taskId;
		const raw = await this.json('/exercises/evaluate', signal, request);
		requireType(isExerciseAttempt(raw));
		const value = withEffectiveResult(raw);
		requireType(
			value.requestId === expectedRequestId &&
				value.evidence.every(
					(item) =>
						countsAsMastery(value.result) &&
						item.taskId === expectedTaskId &&
						(item.attemptId === undefined || item.attemptId === value.attemptId)
				)
		);
		return value;
	}

	async getActivityMirror(
		course: CourseRef,
		signal?: AbortSignal
	): Promise<ActivityMirrorSnapshot> {
		const expectedCourse: CourseRef = {
			courseId: course.courseId,
			courseVersion: course.courseVersion
		};
		const query = new URLSearchParams({
			courseId: expectedCourse.courseId,
			courseVersion: expectedCourse.courseVersion
		});
		const value = await this.json(`/activity/mirror?${query}`, signal);
		requireType(isMirror(value) && sameCourse(value.course, expectedCourse));
		const recentPractice = value.recentPractice.map(withEffectiveResult);
		// Evidence of an attempt that is not mastery (partial, wrong, received only) is dropped.
		const notMastery = new Set(
			recentPractice.filter(({ result }) => !countsAsMastery(result)).map(({ id }) => id)
		);
		const evidence = value.evidence.filter((item) => {
			const id = evidenceAttemptId(item, recentPractice);
			return id === undefined || !notMastery.has(id);
		});
		return { ...value, recentPractice, evidence };
	}

	async health(signal?: AbortSignal): ReturnType<TutorApiClient['health']> {
		const value = await this.json('/health', signal);
		requireType(isRecord(value) && value.status === 'ok' && value.apiVersion === 'v1');
		return { status: value.status, apiVersion: value.apiVersion };
	}
}
