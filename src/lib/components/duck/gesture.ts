/**
 * Gestures of the duck (issue #59): pull the corner duck up into `/tutor`, pull the fullscreen
 * duck down to leave it, tap it three times quickly for the hipster easter egg. Pure functions,
 * shared by the corner duck and `/tutor`, tested in `triggers.test.ts`.
 */

/** Vertical travel past which a released pull commits instead of springing back. */
export const SWIPE_THRESHOLD = 56;
/** Below this travel a press is a tap, not a pull. */
export const TAP_SLOP = 6;

export type SwipeDirection = 'up' | 'down';
export type SwipeOutcome = 'tap' | 'commit' | 'rebound';

/**
 * Rubber band: the duck follows the finger, with growing resistance, and never travels more
 * than `limit` pixels. Sign and zero are kept.
 */
export function rubberBand(distance: number, limit = 160): number {
	if (!Number.isFinite(distance) || distance === 0) return 0;
	const travel = Math.abs(distance);
	return Math.sign(distance) * limit * (1 - 1 / (travel / limit + 1));
}

/** Only travel in the wanted direction pulls; the other direction rests at 0. */
export function pullDistance(dy: number, direction: SwipeDirection): number {
	return direction === 'up' ? Math.min(0, dy) : Math.max(0, dy);
}

/** What a released press means: a tap, a committed pull or a spring back. */
export function swipeOutcome(
	dx: number,
	dy: number,
	direction: SwipeDirection,
	threshold = SWIPE_THRESHOLD
): SwipeOutcome {
	if (Math.hypot(dx, dy) < TAP_SLOP) return 'tap';
	if (Math.abs(dy) <= Math.abs(dx)) return 'rebound';
	const travel = direction === 'up' ? -dy : dy;
	return travel >= threshold ? 'commit' : 'rebound';
}

/**
 * Counts quick taps. Returns true on the tap that completes a burst of `count` taps within
 * `windowMs`, then starts counting afresh.
 */
export function createTapBurst(count = 3, windowMs = 900) {
	let taps: number[] = [];
	return {
		tap(now: number): boolean {
			taps = [...taps.filter((time) => now - time <= windowMs), now];
			if (taps.length < count) return false;
			taps = [];
			return true;
		},
		/** Time since the previous tap, Infinity if none is pending. */
		since(now: number): number {
			return taps.length ? now - taps[taps.length - 1] : Infinity;
		},
		reset() {
			taps = [];
		}
	};
}

/** The hipster easter egg's own lines; dry, never cute (DESIGN.md §9.2a, §10.2). */
export const HIPSTER_ON_LINE = 'Club-Mate geht immer.';
export const HIPSTER_OFF_LINE = 'Zurück zur Brille.';
