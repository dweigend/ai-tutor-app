/**
 * Pure rules of the Fader (ui/DESIGN.md §11 P4): one axis, one grip, detents. The grip follows
 * the finger freely and springs into the nearest detent on release; within the magnet zone it
 * jumps the last pixels, so the snap is visible (no vibration on iPhone Safari, §4.9).
 * Also the mappings of the three recipes: SpectrumSlider, ConfidenceStrip, ScaleFader.
 */

/** Share of a detent spacing within which the grip is pulled onto the detent while dragging. */
export const MAGNET_SHARE = 0.18;

/** The detent nearest to `position`. `detents` must be sorted ascending and non-empty. */
export function nearestDetent(position: number, detents: readonly number[]): number {
	let best = detents[0];
	for (const detent of detents) {
		if (Math.abs(detent - position) < Math.abs(best - position)) best = detent;
	}
	return best;
}

/** Where the grip is drawn while dragging: on the detent inside the magnet zone, else free. */
export function magnetPosition(position: number, detents: readonly number[]): number {
	const detent = nearestDetent(position, detents);
	const index = detents.indexOf(detent);
	const neighbour = detents[index + 1] ?? detents[index - 1];
	const spacing = neighbour === undefined ? Infinity : Math.abs(neighbour - detent);
	return Math.abs(position - detent) <= spacing * MAGNET_SHARE ? detent : position;
}

/** The detent `steps` places away from the one nearest to `position`, clamped to the ends. */
export function stepDetent(position: number, detents: readonly number[], steps: number): number {
	const index = detents.indexOf(nearestDetent(position, detents));
	return detents[Math.max(0, Math.min(detents.length - 1, index + steps))];
}

/** Evenly spaced detents from min to max (inclusive), rounded against float drift. */
export function evenDetents(min: number, max: number, step: number): number[] {
	const count = Math.round((max - min) / step);
	return Array.from({ length: count + 1 }, (_, index) => Number((min + index * step).toFixed(10)));
}

/** Position of `value` on the axis as a share from 0 to 1. */
export function share(value: number, min: number, max: number): number {
	return max === min ? 0 : (value - min) / (max - min);
}

// ---------------------------------------------------------------------------------------------
// SpectrumSlider: nine detents −4 … 4. The middle is UNSICHER, each side NEIN or JA with
// 25, 50, 75 and 100 % certainty (art-direction-review §3.5).
// ---------------------------------------------------------------------------------------------

export const SPECTRUM_DETENTS = [-4, -3, -2, -1, 0, 1, 2, 3, 4] as const;

export type SpectrumSide = 'no' | 'none' | 'yes';
export type Certainty = 25 | 50 | 75 | 100;

export interface SpectrumReading {
	side: SpectrumSide;
	/** The one display word above the stage; it switches hard at the middle. */
	word: 'NEIN' | 'UNSICHER' | 'JA';
	/** Null in the middle: a deliberate abstention, not 0 %. */
	certainty: Certainty | null;
	/** Spoken value of the slider, e.g. "Ja, 75 Prozent sicher". */
	valuetext: string;
}

/** Reading of a grip position; the nearest detent decides, so the word flips at ±0,5. */
export function spectrumReading(position: number): SpectrumReading {
	const detent = nearestDetent(position, SPECTRUM_DETENTS);
	if (detent === 0) {
		return { side: 'none', word: 'UNSICHER', certainty: null, valuetext: 'Unsicher, ohne Angabe' };
	}
	const certainty = (Math.abs(detent) * 25) as Certainty;
	const yes = detent > 0;
	return {
		side: yes ? 'yes' : 'no',
		word: yes ? 'JA' : 'NEIN',
		certainty,
		valuetext: `${yes ? 'Ja' : 'Nein'}, ${certainty} Prozent sicher`
	};
}

/**
 * The flood, as shares of the axis (0 = left, 0,5 = the middle mark). It runs between the middle
 * and the grip, so its edge follows the grip 1:1 and the yellow grows with the certainty: JA 100 %
 * floods the right half, NEIN 100 % the left half (art-director correction K2). In the middle
 * there is no flood; it switches on hard at the same point as the word, never as a fade.
 */
export function spectrumFlood(position: number): { from: number; to: number } | null {
	if (nearestDetent(position, SPECTRUM_DETENTS) === 0) return null;
	const at = share(position, -4, 4);
	return position > 0 ? { from: 0.5, to: at } : { from: at, to: 0.5 };
}

/**
 * What a committed spectrum answer means: yes or no with a certainty, or an abstention. Matches
 * the confidence values of the API (25 | 50 | 75 | 100, null = ohne Angabe).
 */
export function spectrumAnswer(detent: number): {
	answer: 'ja' | 'nein' | null;
	confidence: Certainty | null;
} {
	const { side, certainty } = spectrumReading(detent);
	return { answer: side === 'yes' ? 'ja' : side === 'no' ? 'nein' : null, confidence: certainty };
}

/**
 * Whether a spectrum answer can be committed. Untouched, the grip rests in the middle by default
 * and says nothing, so "Festlegen" stays locked. Once the learner has moved or set the grip, the
 * middle is a deliberate abstention (UNSICHER) and counts like any other detent (art director,
 * #11).
 */
export function spectrumCommittable(touched: boolean): boolean {
	return touched;
}

/** The committed spectrum answer, or null while the grip is untouched (no statement yet). */
export function spectrumChoice(
	detent: number,
	touched: boolean
): ReturnType<typeof spectrumAnswer> | null {
	return spectrumCommittable(touched) ? spectrumAnswer(detent) : null;
}

// ---------------------------------------------------------------------------------------------
// ConfidenceStrip: four flush segments plus "ohne Angabe". undefined = not chosen yet.
// ---------------------------------------------------------------------------------------------

export type Confidence = Certainty | null | undefined;

const CONFIDENCE_WORDS: Record<Certainty, string> = {
	25: 'geraten',
	50: 'eher unsicher',
	75: 'ziemlich sicher',
	100: 'sicher'
};

/** Rating level 0–4 of a confidence; ohne Angabe and not chosen are 0. */
export function confidenceLevel(confidence: Confidence): number {
	return confidence ? confidence / 25 : 0;
}

/** Confidence of a rating level; 0 means not chosen. */
export function levelConfidence(level: number): Confidence {
	const rounded = Math.round(level);
	return rounded >= 1 && rounded <= 4 ? ((rounded * 25) as Certainty) : undefined;
}

/** Spoken and printed reading, e.g. "ziemlich sicher, 75 Prozent" or "ohne Angabe". */
export function confidenceText(confidence: Confidence): string {
	if (confidence === undefined) return 'nicht gewählt';
	if (confidence === null) return 'ohne Angabe';
	return `${CONFIDENCE_WORDS[confidence]}, ${confidence} Prozent`;
}

/** Short reading for the DU line: `75 %` or `ohne Angabe`. */
export function confidenceShort(confidence: Confidence): string | undefined {
	if (confidence === undefined) return undefined;
	return confidence === null ? 'ohne Angabe' : `${confidence} %`;
}
