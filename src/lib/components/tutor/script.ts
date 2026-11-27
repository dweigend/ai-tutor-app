import type { TutorInput, TutorMoveKind } from '$lib/api/types';
import type { DiagnosisTrigger, SocraticStep, TutorScenario } from '$lib/content/types';

// The turn response carries no step ID. To offer the scenario's quick replies at the right moment
// the page follows the same flow contract as MockTutorClient (see content/tutor.ts): the current
// step diagnoses the incoming input, then the script moves on. The cursor only picks suggestions;
// what the tutor says always comes from the API.

export interface ScriptCursor {
	stepId: string;
	/** After a parallel example the next undiagnosed turn returns to the task first. */
	needsReturn: boolean;
}

export type QuickReply = NonNullable<SocraticStep['quickReplies']>[number];

export const MOVE_LABEL: Record<TutorMoveKind, string> = {
	warten: 'Wartet',
	nachhaken: 'Gegenfrage',
	paraphrasieren: 'Paraphrase',
	vorhersage_verlangen: 'Vorhersage',
	kontrastfall: 'Kontrastfall',
	gestufter_hinweis: 'Hinweis',
	kurz_erklaeren: 'Kurz erklärt',
	beispiel_zeigen: 'Paralleles Beispiel',
	zurueckerklaeren_lassen: 'Zurückerklären',
	abruf_pruefen: 'Abruf',
	transfer_stellen: 'Transfer',
	interesse_erfragen: 'Interesse',
	routine_vorschlagen: 'Routine',
	pause_anbieten: 'Pause',
	abschliessen: 'Abschluss'
};

export function startCursor(scenario: TutorScenario): ScriptCursor {
	return { stepId: scenario.steps[0].id, needsReturn: false };
}

export function currentStep(scenario: TutorScenario, cursor: ScriptCursor): SocraticStep {
	return scenario.steps.find((step) => step.id === cursor.stepId) ?? scenario.steps[0];
}

function normalize(text: string): string {
	return text.normalize('NFC').trim().toLocaleLowerCase('de').replace(/\s+/g, ' ');
}

export function matchesTrigger(input: TutorInput, trigger: DiagnosisTrigger): boolean {
	if (trigger.kind === 'input') return input.kind === trigger.inputKind;
	if (!('text' in input) || input.text === undefined) return false;
	const text = normalize(input.text);
	if (trigger.kind === 'text') return trigger.accepted.some((entry) => normalize(entry) === text);
	return trigger.phrases.every((phrase) => text.includes(normalize(phrase)));
}

/** Moves the cursor past one confirmed turn; returns the diagnosis that matched, if any. */
export function advance(
	scenario: TutorScenario,
	cursor: ScriptCursor,
	input: TutorInput
): { cursor: ScriptCursor; diagnosisId: string | null } {
	const step = currentStep(scenario, cursor);
	if (input.kind === 'explain' && scenario.parallelExample) {
		return { cursor: { stepId: step.id, needsReturn: true }, diagnosisId: null };
	}
	if (input.kind === 'whiteboard') {
		return { cursor: { stepId: step.id, needsReturn: false }, diagnosisId: null };
	}
	// Check delegation boundaries before subject diagnoses so phrases like "Sag mir einfach ..."
	// cannot match an accidental substring in a domain diagnosis (e.g. "fach").
	const delegation = scenarioDelegation(scenario, step, input);
	if (delegation) {
		return {
			cursor: { stepId: step.id, needsReturn: cursor.needsReturn },
			diagnosisId: delegation.id
		};
	}
	const diagnosis = step.diagnoses?.find((entry) => matchesTrigger(input, entry.trigger));
	if (cursor.needsReturn && !diagnosis) {
		return { cursor: { stepId: step.id, needsReturn: false }, diagnosisId: null };
	}
	const stepId = diagnosis?.nextStepId ?? step.nextStepId ?? step.id;
	return { cursor: { stepId, needsReturn: false }, diagnosisId: diagnosis?.id ?? null };
}

/** A scripted "let me think" text when this step expects the tutor to wait. */
export function waitText(step: SocraticStep): string | null {
	const diagnosis = step.diagnoses?.find(
		(entry) => entry.reply.move === 'warten' && entry.trigger.kind === 'text'
	);
	if (diagnosis?.trigger.kind !== 'text') return null;
	return diagnosis.trigger.accepted[0] ?? null;
}

type Diagnosis = NonNullable<SocraticStep['diagnoses']>[number];

function isDelegation(diagnosis: Diagnosis): boolean {
	return diagnosis.id.startsWith('delegation');
}

/** A `delegation-*` diagnosis in the current step first, then anywhere in the scenario. */
function scenarioDelegation(
	scenario: TutorScenario,
	current: SocraticStep,
	input: TutorInput
): Diagnosis | null {
	for (const step of [current, ...scenario.steps.filter((entry) => entry.id !== current.id)]) {
		const match = step.diagnoses?.find(
			(entry) => isDelegation(entry) && matchesTrigger(input, entry.trigger)
		);
		if (match) return match;
	}
	return null;
}

function delegationReply(step: SocraticStep): QuickReply | null {
	for (const diagnosis of step.diagnoses?.filter(isDelegation) ?? []) {
		const reply = step.quickReplies?.find((entry) =>
			matchesTrigger(entry.input, diagnosis.trigger)
		);
		if (reply) return reply;
	}
	return null;
}

/**
 * The scenario's own wording for asking straight for the solution. The current step comes first;
 * otherwise any step's delegation reply, so every step sends the same recognised request.
 */
export function solutionRequest(scenario: TutorScenario, step: SocraticStep): QuickReply | null {
	const own = delegationReply(step);
	if (own) return own;
	for (const other of scenario.steps) {
		const reply = delegationReply(other);
		if (reply) return reply;
	}
	return null;
}

/**
 * "Ich stecke fest": the step's own reply that leads to a graded hint, if it has one. Otherwise
 * the plain sentence; the tutor then asks the step's question again.
 */
export function stuckRequest(step: SocraticStep): TutorInput {
	const hint = step.diagnoses?.find((entry) => entry.reply.move === 'gestufter_hinweis');
	const reply = hint
		? step.quickReplies?.find((entry) => matchesTrigger(entry.input, hint.trigger))
		: undefined;
	return reply?.input ?? { kind: 'message', text: 'Ich stecke fest.' };
}

/**
 * How a typed line goes out. `message` is a free question or guess and is never graded;
 * `answer` only when the learner explicitly hands in an answer. A confidence set earlier never
 * turns a question into an answer, and it travels only with an explicit answer.
 */
export type DraftMode = 'message' | 'answer';

export function draftInput(text: string, mode: DraftMode, confidence?: number): TutorInput {
	if (mode !== 'answer') return { kind: 'message', text };
	return confidence === undefined ? { kind: 'answer', text } : { kind: 'answer', text, confidence };
}
