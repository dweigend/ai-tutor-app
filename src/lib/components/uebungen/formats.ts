import type { ExerciseFormat } from '$lib/content';

export const formatLabel: Readonly<Record<ExerciseFormat, string>> = {
	'quick-challenge': 'Blitzabruf',
	retrieval: 'Abruf',
	'plausible-but-wrong': 'Plausibel, aber falsch',
	'contrast-lab': 'Kontrast-Labor',
	'deep-dive': 'Deep Dive',
	'independent-probe': 'Unabhängige Probe'
};

/** Short names in the 44px strip (konzept M1); the full name stays the accessible name. */
export const formatShort: Readonly<Record<ExerciseFormat, string>> = {
	'quick-challenge': 'Blitz',
	retrieval: 'Abruf',
	'plausible-but-wrong': 'Fehlersuche',
	'contrast-lab': 'Kontrast',
	'deep-dive': 'Deep Dive',
	'independent-probe': 'Probe'
};

// Filter order runs from the shortest entry to the independent probe.
export const formatOrder: readonly ExerciseFormat[] = [
	'quick-challenge',
	'retrieval',
	'plausible-but-wrong',
	'contrast-lab',
	'deep-dive',
	'independent-probe'
];
