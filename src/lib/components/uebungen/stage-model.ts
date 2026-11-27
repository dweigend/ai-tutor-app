import type { CheckResult } from '../../api/types.js';
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

const RESULT_FINDING: Record<CheckResult, Finding> = {
	korrekt: 'match',
	teilweise: 'partial',
	falsch: 'deviates'
};

export function findingOf(result: CheckResult): Finding {
	return RESULT_FINDING[result];
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
