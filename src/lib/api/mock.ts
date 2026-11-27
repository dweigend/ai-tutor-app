import type {
	DiagnosisTrigger,
	ExerciseCheckRule,
	ScriptedTutorMove,
	TutorScenario,
	TutorialCheckRule
} from '../content/types.js';
import { INDEPENDENT_PROBE_HELP, isProtectedTutorTurn } from '../memory/screen-context.js';
import { exerciseForTask } from '../content/uebungen.js';
import { contextualReference } from '../memory/snapshot.js';
import type { AgentContextSnapshot } from '../memory/types.js';
import { defaultFixtures, demoTask } from './defaultFixtures.js';
import {
	ApiError,
	countsAsMastery,
	checkAbort,
	isId,
	isRecord,
	isRevision,
	isWhiteboardSnapshot,
	matchesTutorScope,
	sameCourse,
	sameTask
} from './types.js';
import type {
	ActivityMirrorSnapshot,
	ApiProblem,
	CheckResult,
	CourseRef,
	EvidenceKind,
	ExerciseAttemptRequest,
	ExerciseAttemptResponse,
	StreamEvent,
	TutorApiClient,
	TutorArtifact,
	TutorInput,
	TutorTurnRequest,
	TutorTurnResponse,
	TutorialCheckRequest,
	TutorialCheckResponse,
	WhiteboardSnapshot
} from './types.js';

export interface MockFixtures {
	scenarios: readonly TutorScenario[];
	tutorials: readonly {
		course: CourseRef;
		tutorialId: string;
		checkId: string;
		learningGoalId?: string;
		rules: readonly TutorialCheckRule[];
		feedback: string;
	}[];
	exercises: readonly {
		task: ExerciseAttemptRequest['task'];
		rules: readonly ExerciseCheckRule[];
		feedback: string;
		optionFeedback?: Readonly<Record<string, string>>;
		evidence: readonly {
			learningGoalId: string;
			kind: EvidenceKind;
			helpLevel: 0 | 1 | 2 | 3 | 4;
		}[];
	}[];
}

interface MockOptions {
	confirmationDelayMs?: number;
	tokenDelayMs?: number;
	now?: () => Date;
}

interface SessionState {
	session: TutorTurnResponse['session'];
	stepId: string;
	needsReturn: boolean;
	board?: WhiteboardSnapshot;
}

type CachedResponse = TutorTurnResponse | ExerciseAttemptResponse | TutorialCheckResponse;
type CheckAnswer = ExerciseAttemptRequest['answer'];

const HINT_LIMIT = 3;
const RECENT_PRACTICE_LIMIT = 20;
const EXERCISE_QUESTIONS: Readonly<Record<string, string | undefined>> = {
	'a-gd-schritte-vorhersagen':
		'Woran erkennst du am ersten Schritt mit Lernrate η = 1, ob B das Minimum überspringt und beim nächsten Schritt zurückpendelt?',
	'a-akkumulator-vorhersagen':
		'Welchen Wert hat summe in Programm B zu Beginn des zweiten Durchlaufs, direkt vor summe = summe + x?',
	'a-bp-addieren-erklaeren':
		'Wenn du bei d · d beide Pfade rückwärts verfolgst, was würde sich mit einer Zuweisung statt += ändern?',
	'a-bp-ki-backward-pruefen':
		'Wie würdest du die Produktregel bei a = b nutzen, um den Gradienten von a aus dem KI-Code zu prüfen?',
	'a-ki-durchschnitt-pruefen':
		'Warum könnte der Durchschnitt für [10, 20, 30] zufällig stimmen, wenn du im KI-Code Zähler und Nenner getrennt verfolgst?',
	'a-gd-kontrast-gradientenrichtung':
		'Wie bestimmst du in der steilen Schlucht mit der y-Komponente des negativen Gradienten, auf welcher Seite von y = 0 du nach dem ersten Schritt landest?',
	'a-bp-preiskette-transfer':
		'Welche Zwischenwerte im Rechengraphen der Preiskette würdest du von s bis P verfolgen, um die Kettenregel anzuwenden?',
	'a-bp-skizze-rechengraph':
		'Wo verzweigt sich dein Rechengraph, und wie machst du an den Pfeilen sichtbar, welcher Knoten wovon abhängt?',
	'a-gd-lernrate-auswahl':
		'An welcher Stelle wertest du die Ableitung im ersten der zwei Schritte aus, und an welcher Stelle im zweiten?'
};

function conflict(message: string): ApiError {
	return new ApiError({ code: 'conflict', message, retryable: false }, 409);
}

function invalidInput(message: string): ApiError {
	return new ApiError({ code: 'invalid_input', message, retryable: false }, 422);
}

function notFound(message: string): ApiError {
	return new ApiError({ code: 'not_found', message, retryable: false }, 404);
}

function unavailable(message = 'Für diese Abgabe gibt es keine automatische Prüfung.'): ApiError {
	return new ApiError(
		{
			code: 'unavailable',
			message,
			retryable: false
		},
		503
	);
}

function fingerprint(payload: object): string {
	return JSON.stringify(payload, (_key: string, value: unknown) => {
		if (!isRecord(value)) return value;
		return Object.fromEntries(
			Object.keys(value)
				.sort()
				.map((key) => [key, value[key]])
		);
	});
}

function normalizeText(text: string): string {
	return text.normalize('NFC').trim().toLocaleLowerCase('de').replace(/\s+/g, ' ');
}

function matchesTrigger(input: TutorInput, trigger: DiagnosisTrigger): boolean {
	if (trigger.kind === 'input') return input.kind === trigger.inputKind;
	if (!('text' in input) || input.text === undefined) return false;
	const text = normalizeText(input.text);
	if (trigger.kind === 'text')
		return trigger.accepted.some((entry) => normalizeText(entry) === text);
	return trigger.phrases.every((phrase) => text.includes(normalizeText(phrase)));
}

/**
 * A text that is one plain number (optionally with unit) as value and unit: `08`, `8,0`, `8.0` and
 * `+8` are all 8, `-0` is 0. Anything else (a calculation, a sentence) is undefined.
 */
function numberOf(text: string): { value: number; unit: string } | undefined {
	const match = /^([-−+]?)(\d+)(?:[.,](\d+))?\s*(€|%)?$/.exec(normalizeText(text));
	if (!match) return undefined;
	const [, sign, whole, fraction = '0', unit = ''] = match;
	const value = Number(`${whole}.${fraction}`) * (sign === '-' || sign === '−' ? -1 : 1);
	return { value: value === 0 ? 0 : value, unit };
}

/** Text answers match as written, or as the same number when both sides are one number. */
function sameText(answer: string, expected: string): boolean {
	if (normalizeText(answer) === normalizeText(expected)) return true;
	const given = numberOf(answer);
	const wanted = numberOf(expected);
	return (
		given !== undefined &&
		wanted !== undefined &&
		given.value === wanted.value &&
		(given.unit === '' || given.unit === wanted.unit)
	);
}

function matchesAnswer(answer: CheckAnswer, expected: CheckAnswer): boolean {
	if (answer.kind === 'text' && expected.kind === 'text') {
		return sameText(answer.text, expected.text);
	}
	if (answer.kind === 'choice' && expected.kind === 'choice') {
		return (
			answer.optionIds.length === expected.optionIds.length &&
			answer.optionIds.every((id) => expected.optionIds.includes(id))
		);
	}
	if (answer.kind === 'order' && expected.kind === 'order') {
		return (
			answer.itemIds.length === expected.itemIds.length &&
			answer.itemIds.every((id, index) => id === expected.itemIds[index])
		);
	}
	if (answer.kind === 'code' && expected.kind === 'code')
		return answer.source.trim() === expected.source.trim();
	if (answer.kind === 'whiteboard' && expected.kind === 'whiteboard') {
		return fingerprint(answer.snapshot.strokes) === fingerprint(expected.snapshot.strokes);
	}
	return false;
}

function validateConfidence(confidence?: number): void {
	if (
		confidence !== undefined &&
		(!Number.isFinite(confidence) || confidence < 0 || confidence > 100)
	) {
		throw invalidInput('Die Sicherheit muss zwischen 0 und 100 liegen.');
	}
}

function validateSnapshot(snapshot: WhiteboardSnapshot): void {
	if (!isWhiteboardSnapshot(snapshot))
		throw invalidInput('Die Skizze ist leer, zu groß oder enthält ungültige Koordinaten.');
}

function validateAnswer(answer: CheckAnswer): void {
	if (answer.kind === 'whiteboard') {
		validateSnapshot(answer.snapshot);
	} else if (answer.kind === 'choice' || answer.kind === 'order') {
		const ids = answer.kind === 'choice' ? answer.optionIds : answer.itemIds;
		if (!ids.length || ids.some((id) => !isId(id)) || new Set(ids).size !== ids.length) {
			throw invalidInput('Die Abgabe braucht unterschiedliche, gültige Einträge.');
		}
	} else if (!(answer.kind === 'text' ? answer.text : answer.source).trim()) {
		throw invalidInput('Bitte gib eine Antwort ein.');
	}
}

function validateTurn(request: TutorTurnRequest): void {
	if (
		!isId(request.sessionId) ||
		!isRevision(request.expectedRevision) ||
		request.expectedRevision === Number.MAX_SAFE_INTEGER
	) {
		throw invalidInput('Die Sitzung oder Revision ist ungültig.');
	}
	if (request.input.kind === 'whiteboard') validateSnapshot(request.input.snapshot);
	if (request.input.kind === 'answer') validateConfidence(request.input.confidence);
	if (
		(request.input.kind === 'answer' || request.input.kind === 'message') &&
		!request.input.text.trim()
	) {
		throw invalidInput('Bitte gib einen Beitrag ein.');
	}
}

function abortable(wait: Promise<void>, signal?: AbortSignal): Promise<void> {
	checkAbort(signal);
	if (!signal) return wait;
	return new Promise((resolve, reject) => {
		function abort() {
			reject(new DOMException('Die Anfrage wurde abgebrochen.', 'AbortError'));
		}
		signal.addEventListener('abort', abort, { once: true });
		wait.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
	});
}

async function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
	checkAbort(signal);
	if (milliseconds <= 0) return;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const wait = new Promise<void>((resolve) => {
		timer = setTimeout(resolve, milliseconds);
	});
	try {
		await abortable(wait, signal);
	} finally {
		clearTimeout(timer);
	}
}

function learnerMessage(request: TutorTurnRequest): TutorTurnResponse['learnerMessage'] {
	const { input, requestId } = request;
	if (input.kind === 'explain') return null;
	const message = { id: `${requestId}:learner`, role: 'learner' as const, text: input.text ?? '' };
	if (input.kind !== 'whiteboard') return message;
	const { boardId, revision } = input.snapshot;
	return { ...message, attachment: { boardId, revision } };
}

function updateBoard(
	previous: WhiteboardSnapshot | undefined,
	input: TutorInput
): WhiteboardSnapshot | undefined {
	if (input.kind !== 'whiteboard') return previous;
	const snapshot = input.snapshot;
	if (!previous) return snapshot;
	if (previous.boardId !== snapshot.boardId || snapshot.revision < previous.revision) {
		throw conflict(
			'Die Skizze gehört nicht zum aktuellen Board oder ist älter als die letzte Abgabe.'
		);
	}
	if (previous.revision !== snapshot.revision) return snapshot;
	if (fingerprint(previous.strokes) !== fingerprint(snapshot.strokes)) {
		throw conflict('Diese Board-Revision wurde bereits mit anderen Strichen abgegeben.');
	}
	return previous;
}

function chooseMove(
	scenario: TutorScenario,
	state: SessionState,
	input: TutorInput
): { reply: ScriptedTutorMove; nextStepId: string; needsReturn: boolean } {
	const step = scenario.steps.find((entry) => entry.id === state.stepId) ?? scenario.steps[0];
	if (input.kind === 'explain' && scenario.parallelExample) {
		return { reply: scenario.parallelExample, nextStepId: step.id, needsReturn: true };
	}
	if (input.kind === 'whiteboard') {
		const reply = scenario.whiteboardPrompt ?? {
			move: 'nachhaken',
			text: 'Welchen Schritt möchtest du an deiner Skizze erklären?'
		};
		return { reply, nextStepId: step.id, needsReturn: false };
	}
	const delegation = [step, ...scenario.steps.filter((entry) => entry.id !== step.id)]
		.flatMap((entry) => entry.diagnoses ?? [])
		.find((entry) => entry.id.startsWith('delegation') && matchesTrigger(input, entry.trigger));
	if (delegation) {
		return { reply: delegation.reply, nextStepId: step.id, needsReturn: state.needsReturn };
	}
	const diagnosis = step.diagnoses?.find((entry) => matchesTrigger(input, entry.trigger));
	if (state.needsReturn && !diagnosis) {
		return {
			reply: {
				move: 'nachhaken',
				text: 'Alles klar – was ist jetzt dein nächster Schritt bei deiner Aufgabe?'
			},
			nextStepId: step.id,
			needsReturn: false
		};
	}
	const nextStepId = diagnosis?.nextStepId ?? step.nextStepId ?? step.id;
	const reply = diagnosis?.reply ?? step.prompt;

	return { reply, nextStepId, needsReturn: false };
}

/** Follow-up for an open text the rules cannot judge: it asks, it never reveals the solution. */
export const OPEN_TEXT_FOLLOW_UP =
	'Guter Ansatz – magst du kurz nur das Endergebnis angeben oder deinen Rechenweg selbst prüfen?';

/** A single number (optionally with unit), so a mismatch is clear evidence of an error. */
function isSingleValue(text: string): boolean {
	return numberOf(text) !== undefined;
}

function checkOutcome<T extends CheckAnswer>(
	answer: T,
	rules: readonly { accepted: T; result: 'korrekt' | 'teilweise'; feedback: string }[],
	feedback: string,
	openText = false
): { result: CheckResult; feedback: string } {
	const relevant = rules.filter((rule) => rule.accepted.kind === answer.kind);
	const match = relevant.find((rule) => matchesAnswer(answer, rule.accepted));
	if (match) return { result: match.result, feedback: match.feedback };
	// A sketch is a free way to an answer: without an exact rule it is received, not judged. It is
	// neither partial nor wrong and never mastery (fourth evidence state).
	if (answer.kind === 'whiteboard')
		return { result: 'nicht_pruefbar_oder_alternativweg', feedback };
	if (!relevant.length) throw unavailable(feedback);
	// An open exercise text like "4 + 4 = 8" or a free reasoning is an alternative way, not an
	// error. Only a single wrong value is a demonstrable mistake; it gets a hint, not the solution.
	if (openText && answer.kind === 'text' && !isSingleValue(answer.text))
		return { result: 'nicht_pruefbar_oder_alternativweg', feedback: OPEN_TEXT_FOLLOW_UP };
	return { result: 'falsch', feedback };
}

interface PendingTurn {
	payload: string;
	finished: Promise<void>;
}

function applicableContext(request: TutorTurnRequest): AgentContextSnapshot | undefined {
	const context = request.agentContext;
	const screenTask = context?.visibleScreen.taskRef;
	return screenTask && (!request.task || !sameTask(screenTask, request.task)) ? undefined : context;
}

function artifactFor(
	request: TutorTurnRequest,
	context: AgentContextSnapshot | undefined,
	reply: Extract<ScriptedTutorMove, { text: string }>
): TutorArtifact | undefined {
	if (request.input.kind !== 'message' || reply.move === 'kurz_erklaeren') return;
	const text = request.input.text;
	const id = `${request.requestId}:artifact`;
	if (/\b(skizze|diagramm|zeichnung)\b/i.test(text)) {
		return {
			id,
			kind: 'sketch',
			title: 'Koordinatensystem',
			points: [
				[
					{ x: 0.2, y: 0.15 },
					{ x: 0.2, y: 0.8 },
					{ x: 0.85, y: 0.8 }
				]
			],
			caption: 'Welche beiden Größen würdest du auf den Achsen eintragen?'
		};
	}
	if (/\b(code|python|snippet)\b/i.test(text)) {
		return {
			id,
			kind: 'code',
			title: 'Zwischenwert sichtbar machen',
			language: 'python',
			code: 'print(repr("  Beispiel  "))',
			caption: 'Welchen Zwischenwert aus deinem eigenen Versuch würdest du ausgeben?'
		};
	}
	const screen = context?.visibleScreen;
	if (/\b(formel|latex|gleichung)\b/i.test(text) || screen?.formulaId || screen?.termId) {
		return formulaArtifact(id, request.task?.taskId, screen?.formulaId);
	}
	if (/rückfrage/i.test(text)) {
		return { id, kind: 'question', title: 'Dein nächster Schritt', prompt: reply.text };
	}
}

function formulaArtifact(
	id: string,
	taskId: string | undefined,
	formulaId?: string
): TutorArtifact {
	if (formulaId && /attention/i.test(formulaId)) {
		return {
			id,
			kind: 'formula',
			title: 'Skalierte Attention',
			latex: '\\operatorname{softmax}\\!\\left(\\frac{Q K^{\\mathsf{T}}}{\\sqrt{d_k}}\\right)V',
			spoken: 'Softmax von Q mal K transponiert, geteilt durch die Wurzel aus d k, danach mal V.',
			caption: 'Welcher Term gehört zu deiner Frage?'
		};
	}
	if (taskId === demoTask.taskId && !formulaId) {
		return {
			id,
			kind: 'formula',
			title: 'Abweichung eines Messpunkts',
			latex: 'e = \\hat{y} - y',
			spoken: 'Die Abweichung ist der vorhergesagte Wert minus dem gemessenen Wert.',
			caption: 'Wie könntest du Abweichungen auf beiden Seiten vergleichen?'
		};
	}
	return {
		id,
		kind: 'question',
		title: 'Die Formel lesen',
		prompt: 'Welchen Term möchtest du zuerst in eigenen Worten beschreiben?'
	};
}

export class MockTutorClient implements TutorApiClient {
	private readonly sessions = new Map<string, SessionState>();
	private readonly cache = new Map<string, { payload: string; response: CachedResponse }>();
	private readonly pending = new Map<string, PendingTurn>();
	private readonly busySessions = new Set<string>();
	private readonly mirror: ActivityMirrorSnapshot[] = [];
	private readonly fixtures: MockFixtures;
	private readonly confirmDelay: number;
	private readonly tokenDelay: number;
	private readonly now: () => Date;

	constructor(fixtures: MockFixtures = defaultFixtures, options: MockOptions = {}) {
		this.fixtures = structuredClone(fixtures);
		this.confirmDelay = options.confirmationDelayMs ?? 80;
		this.tokenDelay = options.tokenDelayMs ?? 22;
		this.now = options.now ?? (() => new Date());
	}

	private createSession(request: TutorTurnRequest, scenario?: TutorScenario): SessionState {
		return {
			session: {
				id: request.sessionId,
				task: request.task ?? null,
				...(request.course && { course: request.course }),
				revision: 0,
				state: {
					attempts: 0,
					hintsRemaining: HINT_LIMIT,
					explanationAvailable: !!scenario?.parallelExample
				}
			},
			stepId: scenario?.steps[0].id ?? '',
			needsReturn: false
		};
	}

	private commitGuidance(
		request: TutorTurnRequest,
		text: string,
		previous?: SessionState
	): TutorTurnResponse {
		const state = previous ?? this.createSession(request);
		const session = { ...state.session, revision: state.session.revision + 1 };
		this.sessions.set(session.id, { ...state, session });
		return {
			requestId: request.requestId,
			session: {
				...session,
				state: { ...session.state, explanationAvailable: false, hintsRemaining: 0 }
			},
			learnerMessage: learnerMessage(request),
			outcome: 'reply',
			message: {
				id: `${request.requestId}:tutor`,
				role: 'tutor',
				move: 'nachhaken',
				media: [],
				text
			}
		};
	}

	private commitTurn(request: TutorTurnRequest, protectedProbe: boolean): TutorTurnResponse {
		const previous = this.sessions.get(request.sessionId);
		if (previous && !matchesTutorScope(previous.session, request)) {
			throw conflict('Die Sitzung gehört zu einer anderen Aufgabe.');
		}
		if ((previous?.session.revision ?? 0) !== request.expectedRevision) {
			throw conflict('Die Sitzung wurde seit deiner letzten Ansicht geändert.');
		}
		if (protectedProbe) return this.commitGuidance(request, INDEPENDENT_PROBE_HELP, previous);
		const task = request.task;
		if (!task) {
			const context = applicableContext(request);
			const reference =
				context &&
				contextualReference(
					context,
					true,
					request.input.kind === 'message' && /notiz|erinner/i.test(request.input.text)
				);
			const question = previous
				? 'Wie würdest du das an einem Beispiel erklären?'
				: 'An welchem Beispiel möchtest du deine Frage untersuchen?';
			return this.commitGuidance(
				request,
				[reference, question].filter(Boolean).join(' '),
				previous
			);
		}
		const scenario = this.fixtures.scenarios.find((item) => item.task && sameTask(item.task, task));
		if (!scenario) {
			const exercise = exerciseForTask(request.task.taskId);
			if (!exercise || !sameTask(exercise.task, request.task))
				throw notFound('Zu dieser Aufgabe gibt es hier kein Gespräch.');
			const context = applicableContext(request);
			const recall =
				request.input.kind === 'message' &&
				/notiz|gemerkt|erinner|gespeichert/i.test(request.input.text);
			const asksForSolution =
				request.input.kind === 'explain' ||
				/lösung|lös(e|en)|rechne.*für mich|richtig(e|en) antwort/i.test(request.input.text ?? '');
			const reference = context && contextualReference(context, recall && !asksForSolution, recall);
			const question =
				EXERCISE_QUESTIONS[exercise.task.taskId] ?? 'Welchen Schritt möchtest du genauer prüfen?';
			return this.commitGuidance(
				request,
				[
					exercise.title + '.',
					reference,
					asksForSolution && 'Den Lösungsweg entwickelst du selbst.',
					question
				]
					.filter(Boolean)
					.join(' '),
				previous
			);
		}
		const state = previous ?? this.createSession(request, scenario);
		const board = updateBoard(state.board, request.input);
		const {
			reply: scriptedReply,
			nextStepId,
			needsReturn
		} = chooseMove(scenario, state, request.input);
		const reply: ScriptedTutorMove =
			scriptedReply.move === 'gestufter_hinweis' && state.session.state.hintsRemaining === 0
				? { move: 'nachhaken', text: 'Welchen Teilschritt kannst du schon begründen?' }
				: scriptedReply;
		const isAttempt =
			request.input.kind === 'answer' || (board !== undefined && board !== state.board);
		const session = {
			...state.session,
			revision: state.session.revision + 1,
			state: {
				...state.session.state,
				explanationAvailable: !!scenario.parallelExample,
				attempts: state.session.state.attempts + Number(isAttempt),
				hintsRemaining:
					state.session.state.hintsRemaining - Number(reply.move === 'gestufter_hinweis')
			}
		};
		const base = { requestId: request.requestId, session, learnerMessage: learnerMessage(request) };
		this.sessions.set(session.id, { session, board, stepId: nextStepId, needsReturn });
		if (reply.move === 'warten') return { ...base, outcome: 'wait', message: null };
		const context = applicableContext(request);
		const screen = context?.visibleScreen;
		const asksForNote =
			request.input.kind === 'message' &&
			/notiz|gemerkt|erinner|gespeichert/i.test(request.input.text);
		const reference = context
			? contextualReference(context, asksForNote || !screen?.taskRef, asksForNote)
			: '';
		const text = reference ? `${reference} ${reply.text}` : reply.text;
		const artifact = artifactFor(request, context, reply);
		return {
			...base,
			outcome: 'reply',
			message: { id: `${request.requestId}:tutor`, role: 'tutor', ...reply, text, media: [] },
			...(artifact ? { artifact } : {})
		};
	}

	private readCache(requestId: string, payload: string): CachedResponse | undefined {
		if (!isId(requestId)) throw invalidInput('Die Anfrage braucht eine ID.');
		const cached = this.cache.get(requestId);
		if (cached && cached.payload !== payload)
			throw conflict('Diese Anfrage-ID wurde bereits anders verwendet.');
		return cached?.response;
	}

	private async confirmTurn(
		input: TutorTurnRequest,
		wait: number,
		signal?: AbortSignal
	): Promise<TutorTurnResponse> {
		checkAbort(signal);
		const { agentContext, ...body } = input;
		const protectedProbe = isProtectedTutorTurn(body.task, agentContext?.visibleScreen);
		const request = structuredClone(protectedProbe ? body : input);
		const { requestId, sessionId } = request;
		const payload = fingerprint({ request, protectedProbe });
		while (true) {
			const cached = this.readCache(requestId, payload);
			if (cached && 'session' in cached) return structuredClone(cached);
			const pending = this.pending.get(requestId);
			if (!pending) break;
			if (pending.payload !== payload)
				throw conflict('Diese Anfrage-ID wird bereits anders verwendet.');
			await abortable(pending.finished, signal);
			checkAbort(signal);
		}
		validateTurn(request);
		if (this.busySessions.has(sessionId))
			throw conflict('In dieser Sitzung läuft bereits eine Anfrage.');
		let release = () => {};
		const finished = new Promise<void>((resolve) => {
			release = resolve;
		});
		this.pending.set(requestId, { payload, finished });
		this.busySessions.add(sessionId);
		try {
			await delay(wait, signal);
			checkAbort(signal);
			const response = this.commitTurn(request, protectedProbe);
			this.cache.set(requestId, { payload, response });
			return structuredClone(response);
		} finally {
			this.busySessions.delete(sessionId);
			this.pending.delete(requestId);
			release();
		}
	}

	turn(request: TutorTurnRequest, signal?: AbortSignal): Promise<TutorTurnResponse> {
		return this.confirmTurn(request, 0, signal);
	}

	async *streamTurn(request: TutorTurnRequest, signal?: AbortSignal): AsyncIterable<StreamEvent> {
		let response: TutorTurnResponse;
		try {
			response = await this.confirmTurn(request, this.confirmDelay, signal);
		} catch (error) {
			checkAbort(signal);
			if (!(error instanceof ApiError)) throw error;
			yield { type: 'error', problem: error.problem };
			return;
		}
		const tokens = response.message?.text.match(/\S+\s*|\s+/gu) ?? [];
		for (const text of tokens) {
			await delay(this.tokenDelay, signal);
			checkAbort(signal);
			yield { type: 'delta', text };
		}
		checkAbort(signal);
		yield { type: 'done', response };
	}

	private getMirror(course: CourseRef): ActivityMirrorSnapshot {
		const existing = this.mirror.find((item) => sameCourse(item.course, course));
		if (existing) return existing;
		const snapshot = {
			course: { courseId: course.courseId, courseVersion: course.courseVersion },
			recentPractice: [],
			evidence: []
		};
		this.mirror.push(snapshot);
		return snapshot;
	}

	private recordPractice(
		course: CourseRef,
		practice: ActivityMirrorSnapshot['recentPractice'][number],
		evidence: ActivityMirrorSnapshot['evidence'] = []
	): void {
		const snapshot = this.getMirror(course);
		snapshot.recentPractice.unshift(practice);
		snapshot.recentPractice = snapshot.recentPractice.slice(0, RECENT_PRACTICE_LIMIT);
		snapshot.evidence.unshift(...evidence);
	}

	private evaluate<T extends ExerciseAttemptRequest | TutorialCheckRequest>(
		request: T,
		run: () => Extract<CachedResponse, { kind: T['kind'] }>
	): CachedResponse {
		const payload = fingerprint(request);
		const cached = this.readCache(request.requestId, payload);
		if (cached) return structuredClone(cached);
		if (this.pending.has(request.requestId))
			throw conflict('Diese Anfrage-ID wird bereits anders verwendet.');
		const response = run();
		this.cache.set(request.requestId, { payload, response });
		return structuredClone(response);
	}

	async checkTutorial(
		request: TutorialCheckRequest,
		signal?: AbortSignal
	): Promise<TutorialCheckResponse> {
		checkAbort(signal);
		const response = this.evaluate(request, () => {
			validateAnswer(request.answer);
			const fixture = this.fixtures.tutorials.find(
				(item) =>
					sameCourse(item.course, request.course) &&
					item.tutorialId === request.tutorialId &&
					item.checkId === request.checkId
			);
			if (!fixture) throw notFound('Dieser Check wurde nicht gefunden.');
			const outcome = checkOutcome(request.answer, fixture.rules, fixture.feedback);
			const recordedAt = this.now().toISOString();
			const evidence = countsAsMastery(outcome.result)
				? [
						{
							id: `${request.requestId}:1`,
							attemptId: request.requestId,
							taskId: request.tutorialId,
							learningGoalId: fixture.learningGoalId ?? request.checkId,
							kind: 'vorhersage' as const,
							helpLevel: 0 as const,
							recordedAt
						}
					]
				: [];
			this.recordPractice(
				request.course,
				{
					kind: 'tutorial',
					id: request.requestId,
					itemId: request.tutorialId,
					result: outcome.result,
					recordedAt
				},
				evidence
			);
			return { kind: 'tutorial', requestId: request.requestId, ...outcome };
		});
		if (!('kind' in response) || response.kind !== 'tutorial')
			throw conflict('Die Anfrage-ID gehört zu einer anderen Abgabe.');
		return response;
	}

	async evaluateExercise(
		request: ExerciseAttemptRequest,
		signal?: AbortSignal
	): Promise<ExerciseAttemptResponse> {
		checkAbort(signal);
		const response = this.evaluate(request, () => {
			validateConfidence(request.confidence);
			validateAnswer(request.answer);
			const fixture = this.fixtures.exercises.find((item) => sameTask(item.task, request.task));
			if (!fixture) throw notFound('Diese Übung wurde nicht gefunden.');
			const { answer } = request;
			const optionId =
				answer.kind === 'choice' && answer.optionIds.length === 1 ? answer.optionIds[0] : undefined;
			const { optionFeedback } = fixture;
			const feedback =
				optionId && optionFeedback && Object.hasOwn(optionFeedback, optionId)
					? optionFeedback[optionId]
					: fixture.feedback;
			const outcome = checkOutcome(answer, fixture.rules, feedback, true);
			const recordedAt = this.now().toISOString();
			const attemptId = `${request.requestId}:attempt`;
			const evidence = countsAsMastery(outcome.result)
				? fixture.evidence.map((item, index) => ({
						...item,
						id: `${attemptId}:${index + 1}`,
						attemptId,
						taskId: request.task.taskId,
						recordedAt
					}))
				: [];
			this.recordPractice(
				request.task,
				{
					kind: 'exercise',
					id: attemptId,
					itemId: request.task.taskId,
					result: outcome.result,
					recordedAt
				},
				evidence
			);
			return { kind: 'exercise', requestId: request.requestId, attemptId, ...outcome, evidence };
		});
		if (!('kind' in response) || response.kind !== 'exercise')
			throw conflict('Die Anfrage-ID gehört zu einer anderen Abgabe.');
		return response;
	}

	async getActivityMirror(
		course: CourseRef,
		signal?: AbortSignal
	): Promise<ActivityMirrorSnapshot> {
		checkAbort(signal);
		return structuredClone(this.getMirror(course));
	}

	async health(signal?: AbortSignal): ReturnType<TutorApiClient['health']> {
		checkAbort(signal);
		return { status: 'ok', apiVersion: 'v1' };
	}
}
