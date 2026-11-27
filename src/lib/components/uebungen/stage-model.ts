import { effectiveResult } from '../../api/types.js';
import type {
	ApiMode,
	ApiProblem,
	CheckResult,
	EvidenceLevel,
	ExerciseAttemptRequest
} from '../../api/types.js';
import type {
	EditorialExercise,
	ExerciseStage,
	StageFacts,
	StageInstrument,
	StageStep
} from '../../content/index.js';
// Relative module paths keep this file loadable in Node for stage-model.test.ts.
import { speakRichText } from '../../modules/core/rich-text.js';
import type { Confidence } from '../../modules/fader/scale.js';
import type { IconName } from '../../modules/core/icons.js';
import type { Finding } from '../../modules/readout/types.js';
import type { ScreenContextInput } from '../../memory/types.js';

/**
 * Glue between the content layer and the InteractionStage: no module knows the content, no
 * content knows the modules. Pure functions only.
 */

/** Stage of an exercise; without a `stage` field the long prompt becomes one step. */
export function stageOf(exercise: EditorialExercise): ExerciseStage {
	if (exercise.stage) return exercise.stage;
	const { response } = exercise;
	const instrument: StageInstrument =
		response.answerKind === 'choice'
			? { kind: 'choice', layout: 'rows' }
			: response.answerKind === 'whiteboard'
				? { kind: 'sketch' }
				: { kind: 'digits', decimals: 3, signed: true };
	return { steps: [{ id: 'aufgabe', ask: exercise.prompt, instrument }] };
}

export function listTitle(exercise: EditorialExercise): string {
	return exercise.stage?.title ?? exercise.title;
}

/** Spoken version of the facts; code is announced, never spelled out (konzept Z4). */
export function speakFacts(facts: StageFacts): string {
	switch (facts.kind) {
		case 'cells':
			return facts.cells
				.map((cell) => `${speakRichText(cell.label)} ${speakRichText(cell.value)}`)
				.join(', ');
		case 'pair':
			return facts.sides
				.map((side) => `${side.key}, ${speakRichText(side.label)}: ${speakRichText(side.value)}`)
				.join('. ');
		case 'code':
			return facts.sides
				.map((side) => `Code ${side.key}, ${side.code.split('\n').length} Zeilen`)
				.join('. ');
	}
}

/** What ReadAloud says for the head: the edited `spoken` text, else context, facts, question. */
export function speakHead(step: StageStep): string {
	if (step.spoken) return step.spoken;
	return [step.context && speakRichText(step.context), step.facts && speakFacts(step.facts)]
		.filter(Boolean)
		.concat(speakRichText(step.ask))
		.join('. ');
}

/** Option legends are digits, so they never collide with programs A and B (K1). */
export const LEGENDS = '12345678';

export interface StageOption {
	id: string;
	label: string;
}

/** Options as the stage shows them: the edited short form where there is one. */
export function stageOptions(
	options: readonly StageOption[],
	instrument: StageInstrument
): StageOption[] {
	const labels = instrument.kind === 'choice' ? instrument.labels : undefined;
	return options.map((option) => ({ id: option.id, label: labels?.[option.id] ?? option.label }));
}

export function speakOptions(options: readonly StageOption[]): string {
	return options
		.map((option, index) => `${LEGENDS[index]}: ${speakRichText(option.label)}`)
		.join('. ');
}

/** Voice of a choice's options: the content decides; rows default to sentences. */
export function choiceVoice(instrument: StageInstrument): 'value' | 'sentence' {
	if (instrument.kind !== 'choice') return 'value';
	return instrument.voice ?? (instrument.layout === 'rows' ? 'sentence' : 'value');
}

/** DU line of a choice: one label, or the digits of several (1 + 3). */
export function choiceAnswerText(options: readonly StageOption[], chosen: readonly string[]) {
	const picked = options.filter((option) => chosen.includes(option.id));
	if (picked.length === 1) return picked[0].label;
	return picked.map((option) => LEGENDS[options.indexOf(option)]).join(' + ');
}

/** Line ids `z5` → readable `Zeilen 5 · 6`. */
export function linesText(ids: readonly string[]): string {
	const numbers = ids.map((id) => Number(id.slice(1))).sort((left, right) => left - right);
	return `${numbers.length === 1 ? 'Zeile' : 'Zeilen'} ${numbers.join(' · ')}`;
}

/** Local check of a LinePick step: same set matches, an overlap deviates partly. */
export function checkLines(picked: readonly string[], expected: readonly string[]): Finding {
	const hits = picked.filter((id) => expected.includes(id)).length;
	if (hits === expected.length && picked.length === expected.length) return 'match';
	return hits > 0 ? 'partial' : 'deviates';
}

/**
 * Finding of a check result. The fourth evidence state (`nicht_pruefbar_oder_alternativweg`) has no
 * finding: the sketch or alternative way was received, nobody judged it. The stage shows it as a
 * neutral "Eingereicht", never as partial, never as a match.
 */
const RESULT_FINDING: Record<CheckResult, Finding | null> = {
	korrekt: 'match',
	teilweise: 'partial',
	falsch: 'deviates',
	nicht_pruefbar_oder_alternativweg: null
};

export function findingOf(result: CheckResult): Finding | null {
	return RESULT_FINDING[result];
}

/** The neutral word of the fourth evidence state. */
export const RECEIVED_WORD = 'Eingereicht';

/** True when the answer was received but no rule can judge it (fourth evidence state). */
export function isReceivedOnly(result: CheckResult): boolean {
	return result === 'nicht_pruefbar_oder_alternativweg';
}

/**
 * Status the reveal shows: the check's finding, the neutral received state, or the problem of a
 * failed request (also neutral). Only `match` may unlock "done" in the list.
 */
export type RevealStatus = Finding | 'received';

export function revealStatus(result: CheckResult): RevealStatus {
	return findingOf(result) ?? 'received';
}

/** The confidence beside the answer: a number only; no words like "ohne Angabe" on screen. */
export function confidenceFigure(confidence: Confidence): string | undefined {
	return typeof confidence === 'number' ? `${confidence} %` : undefined;
}

/** A typed number is complete once it has a digit and does not end on the comma. */
export function digitsComplete(value: string): boolean {
	return /\d/.test(value) && !value.endsWith(',');
}

/** Paragraphs of a `more` text, split at empty lines. */
export function paragraphs(text: string): string[] {
	return text
		.split(/\n{2,}/)
		.map((part) => part.trim())
		.filter(Boolean);
}

/**
 * What "Festlegen" or "Weiter" does on a step. Only the answer step may reach the API; paper,
 * local line checks and the spectrum stay in the browser. Any other step holds (council R1).
 */
export type CommitRoute =
	'next' | 'local-lines' | 'local-spectrum' | 'confidence' | 'submit' | 'hold';

export type ConfidenceMode = 'inline' | 'step';

export function exerciseScreen(
	exercise: EditorialExercise,
	step: StageStep,
	answerSelected: string,
	confidence: Confidence,
	outcomeKind: 'response' | 'problem' | 'local' | undefined,
	isReview: boolean
): ScreenContextInput {
	// The stage also shows failed requests in its result panel. Only a confirmed response
	// unlocks a probe. Reaching the review step already requires such a response.
	const revealed = outcomeKind === 'response' || isReview;
	return {
		route: '/uebungen',
		taskRef: exercise.task,
		courseId: exercise.task.courseId,
		topic: exercise.title,
		sectionTitle: step.ask,
		isIndependentProbe: exercise.format === 'independent-probe' && !revealed,
		exerciseState: {
			answerSelected: answerSelected || undefined,
			confidence: confidence ?? undefined,
			revealed
		}
	};
}

// Compact stages such as 390×664 need the space for the answer and primary action.
const MIN_INLINE_CONFIDENCE_HEIGHT = 680;

export function confidenceModeForHeight(
	stageHeight: number,
	instrumentOverflows = false
): ConfidenceMode {
	return stageHeight < MIN_INLINE_CONFIDENCE_HEIGHT || instrumentOverflows ? 'step' : 'inline';
}

export function emptyAnswer(): {
	choice: string[];
	digits: string;
	lines: string[];
	spectrum: number;
	spectrumTouched: boolean;
	confidence: Confidence;
} {
	return {
		choice: [],
		digits: '',
		lines: [],
		spectrum: 0,
		spectrumTouched: false,
		confidence: undefined
	};
}

export function commitRoute(input: {
	step: StageStep;
	isAnswerStep: boolean;
	phase: 'answer' | 'confidence' | 'revealed';
	asksConfidence: boolean;
	confidenceMode: ConfidenceMode;
}): CommitRoute {
	const { step, isAnswerStep, phase, asksConfidence, confidenceMode } = input;
	if (phase === 'revealed') return 'hold';
	if (step.instrument.kind === 'paper') return 'next';
	if (step.instrument.kind === 'lines' && step.localCheck) return 'local-lines';
	if (step.instrument.kind === 'spectrum') return 'local-spectrum';
	if (!isAnswerStep) return 'hold';
	if (phase === 'answer' && asksConfidence && confidenceMode === 'step') return 'confidence';
	return 'submit';
}

/** The answer step's instrument must produce what the API expects of the task. */
const API_INSTRUMENT: Partial<
	Record<EditorialExercise['response']['answerKind'], StageInstrument['kind']>
> = {
	choice: 'choice',
	text: 'digits',
	whiteboard: 'sketch'
};

/**
 * Problems of a stage's step order, empty when valid: steps before the answer step stay local
 * (paper or a checked LinePick), the last step answers the API, a review step is local.
 */
export function stageProblems(exercise: EditorialExercise): string[] {
	const { steps, review } = stageOf(exercise);
	const problems: string[] = [];
	if (steps.length === 0) problems.push('no step');
	const ids = [...steps, ...(review ? [review] : [])].map((step) => step.id);
	if (new Set(ids).size !== ids.length) problems.push('duplicate step id');
	steps.forEach((step, index) => {
		const last = index === steps.length - 1;
		const route = commitRoute({
			step,
			isAnswerStep: last,
			phase: 'answer',
			asksConfidence: false,
			confidenceMode: 'inline'
		});
		if (!last && route !== 'next' && route !== 'local-lines') {
			problems.push(`${step.id}: an intermediate step must stay local`);
		}
		if (last && route !== 'submit') problems.push(`${step.id}: the last step must answer`);
		if (last && step.instrument.kind !== API_INSTRUMENT[exercise.response.answerKind]) {
			problems.push(`${step.id}: instrument does not fit ${exercise.response.answerKind}`);
		}
	});
	if (review && review.instrument.kind !== 'spectrum') problems.push('review must be local');
	return problems;
}

/** The result an attempt stands for: a sent evidence level wins over the legacy result. */
export function attemptResult(response: {
	result: CheckResult;
	evidenceLevel?: EvidenceLevel;
}): CheckResult {
	return effectiveResult(response.result, response.evidenceLevel);
}

/** Modul-2 test-split tasks are locked in the live backend (AP6); the local demo shows all. */
export function visibleInMode(taskId: string, mode: ApiMode): boolean {
	return mode !== 'http' || !taskId.startsWith('a-gd-');
}

/** The task a deep link asks for (`?aufgabe=` or `?task=`), unless it is locked in this mode. */
export function openableTaskId(params: URLSearchParams, mode: ApiMode): string | null {
	const taskId = params.get('aufgabe') ?? params.get('task');
	return taskId && visibleInMode(taskId, mode) ? taskId : null;
}

/** Whether an in-app route can open in this mode; a link to a locked task cannot (AP6). */
export function routeOpensInMode(route: string, mode: ApiMode): boolean {
	const url = new URL(route, 'http://app.invalid');
	if (url.pathname !== '/uebungen') return true;
	const taskId = url.searchParams.get('aufgabe') ?? url.searchParams.get('task');
	return !taskId || visibleInMode(taskId, mode);
}

/** Second line of defence: a locked task never reaches the live grader, not even by deep link. */
export const LOCKED_TASK_PROBLEM = {
	code: 'not_found',
	message: 'Diese Übung ist im Live-Betrieb noch nicht freigegeben.',
	retryable: false
} as const satisfies ApiProblem;

/**
 * Tasks the live backend knows as `fehler_finden` without options: it rejects a choice answer.
 * Live, they send the picked lines and tests as text and come back as a received, unjudged attempt.
 */
const LIVE_TEXT_TASKS: ReadonlySet<string> = new Set(['a-bp-ki-backward-pruefen']);

/**
 * Prediction tasks the live course package grades as program output (`pruefung.art: ausgabe`).
 * Live, the chosen option is sent as the output it stands for, one printed line per program.
 */
const LIVE_OUTPUT_CHOICES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
	'a-akkumulator-vorhersagen': {
		'a9-b4': '9\n4',
		'a9-b9': '9\n9',
		'a4-b9': '4\n9',
		spur: '2\n5\n9\n2\n3\n4'
	}
};

export function liveAnswer(
	taskId: string,
	mode: ApiMode,
	answer: ExerciseAttemptRequest['answer'],
	parts: { lines: readonly string[]; choice: string }
): ExerciseAttemptRequest['answer'] {
	if (mode !== 'http' || answer.kind !== 'choice') return answer;
	const outputs = LIVE_OUTPUT_CHOICES[taskId];
	if (outputs) {
		const [optionId] = answer.optionIds;
		const output = answer.optionIds.length === 1 ? outputs[optionId] : undefined;
		return output ? { kind: 'text', text: output } : answer;
	}
	if (!LIVE_TEXT_TASKS.has(taskId)) return answer;
	const text = [
		parts.lines.length ? linesText(parts.lines) : '',
		parts.choice && `Tests: ${parts.choice}`
	]
		.filter(Boolean)
		.join(' · ');
	return { kind: 'text', text: text || answer.optionIds.join(', ') };
}

/** Format sign of a list card (R6): what the learner does on the answer step. */
export function exerciseIcon(exercise: EditorialExercise): IconName {
	if (exercise.format === 'independent-probe') return 'flag';
	const kinds = stageOf(exercise).steps.map((step) => step.instrument.kind);
	if (kinds.includes('sketch')) return 'pen';
	if (kinds.includes('lines')) return 'check';
	if (kinds.includes('digits') || kinds.includes('spectrum')) return 'sliders';
	return 'grid';
}
