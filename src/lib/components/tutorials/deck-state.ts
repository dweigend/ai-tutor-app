/**
 * Pure state of the 3D slide decks on /erklaerungen (#60): where the reader stands, how a swipe
 * or a key moves on, and the two small judgements of the backprop deck. No DOM, no Svelte.
 */

export interface DeckPlace {
	deck: number;
	slide: number;
}

function clamp(value: number, max: number): number {
	return Number.isFinite(value) ? Math.min(max, Math.max(0, Math.round(value))) : 0;
}

/** `lengths` holds the slide count of every deck. */
export function clampPlace(place: DeckPlace, lengths: readonly number[]): DeckPlace {
	const deck = clamp(place.deck, lengths.length - 1);
	return { deck, slide: clamp(place.slide, lengths[deck] - 1) };
}

/** One slide on or back. The decks follow each other; both ends of the row hold still. */
export function stepPlace(
	place: DeckPlace,
	direction: -1 | 1,
	lengths: readonly number[]
): DeckPlace {
	const { deck, slide } = clampPlace(place, lengths);
	const next = slide + direction;
	if (next >= 0 && next < lengths[deck]) return { deck, slide: next };
	const other = deck + direction;
	if (other < 0 || other >= lengths.length) return { deck, slide };
	return { deck: other, slide: direction > 0 ? 0 : lengths[other] - 1 };
}

/** Deep link `#attention-5`: deck id and the slide counted from one. */
export function parsePlace(
	hash: string,
	decks: readonly { id: string; slides: { length: number } }[]
): DeckPlace | null {
	const match = /^#?([a-z]+)(?:-(\d+))?$/.exec(hash);
	if (!match) return null;
	const deck = decks.findIndex((entry) => entry.id === match[1]);
	if (deck < 0) return null;
	const slide = match[2] ? Number(match[2]) - 1 : 0;
	if (slide < 0 || slide >= decks[deck].slides.length) return null;
	return { deck, slide };
}

export const SWIPE_DISTANCE = 48;
export const TAP_TRAVEL = 8;
export const TAP_MS = 400;

/** A sideways swipe: left moves on (+1), right moves back (−1), anything else stays (0). */
export function swipeStep(dx: number, dy: number): -1 | 0 | 1 {
	if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < 1.5 * Math.abs(dy)) return 0;
	return dx < 0 ? 1 : -1;
}

export function isTap(dx: number, dy: number, ms: number): boolean {
	return Math.hypot(dx, dy) < TAP_TRAVEL && ms < TAP_MS;
}

/** Tapping the stage walks on to the next token or node and wraps at the end. */
export function cycle(index: number, count: number): number {
	return count > 0 ? (((index + 1) % count) + count) % count : 0;
}

export type DescentOutcome = 'short' | 'overshoot' | 'landed';

/** Share of the starting distance that still counts as "in the valley". */
export const LANDED_SHARE = 0.01;

/**
 * Judges the gradient steps of the residual d (the valley is d = 0): a sign change means the
 * ball crossed the valley, otherwise it must end within 1 % of where it started.
 */
export function descentOutcome(descent: readonly number[]): DescentOutcome {
	if (descent.length === 0) return 'short';
	for (let index = 1; index < descent.length; index++) {
		if (descent[index - 1] * descent[index] < 0) return 'overshoot';
	}
	const start = Math.abs(descent[0]);
	return Math.abs(descent[descent.length - 1]) <= start * LANDED_SHARE ? 'landed' : 'short';
}

/** The input whose gradient is larger in size; null when both are equal. */
export function largerGradient(gradients: { a: number; b: number }): 'a' | 'b' | null {
	const a = Math.abs(gradients.a);
	const b = Math.abs(gradients.b);
	if (a === b) return null;
	return a > b ? 'a' : 'b';
}
