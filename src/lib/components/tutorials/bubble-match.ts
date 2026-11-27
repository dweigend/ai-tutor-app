/**
 * Matching logic of the variable bubbles (#60): a bubble is dropped on a slot, the pair is judged
 * and the state moves on. Geometry and state only, so pointer, tap and keyboard share one path.
 */

export interface MatchState<T extends string = string> {
	/** Terms that sit in their slot, in the order they were solved. */
	matched: readonly T[];
	/** Wrong drops so far. */
	misses: number;
}

export const EMPTY_MATCH: MatchState<never> = { matched: [], misses: 0 };

export type MatchOutcome = 'matched' | 'missed' | 'ignored';

export interface MatchResult<T extends string> {
	state: MatchState<T>;
	outcome: MatchOutcome;
	/** True once every one of the `total` bubbles sits. */
	solved: boolean;
}

/**
 * Drops `bubble` on the slot that belongs to `slot`. A bubble or slot that is already solved
 * ignores the drop: nothing is judged and nothing counts.
 */
export function judgeDrop<T extends string>(
	state: MatchState<T>,
	bubble: T,
	slot: T,
	total: number
): MatchResult<T> {
	if (state.matched.includes(bubble) || state.matched.includes(slot)) {
		return { state, outcome: 'ignored', solved: state.matched.length >= total };
	}
	if (bubble !== slot) {
		return {
			state: { matched: state.matched, misses: state.misses + 1 },
			outcome: 'missed',
			solved: false
		};
	}
	const matched = [...state.matched, bubble];
	return {
		state: { matched, misses: state.misses },
		outcome: 'matched',
		solved: matched.length >= total
	};
}

export interface SlotBox<T extends string = string> {
	id: T;
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/** Extra reach around a slot, so a drop near its edge still lands. */
export const DROP_SLOP = 12;

/** The slot under a point. Where two reach it, the nearer centre wins. */
export function slotAt<T extends string>(
	x: number,
	y: number,
	boxes: readonly SlotBox<T>[],
	slop = DROP_SLOP
): T | null {
	let best: T | null = null;
	let bestDistance = Infinity;
	for (const box of boxes) {
		if (x < box.left - slop || x > box.right + slop) continue;
		if (y < box.top - slop || y > box.bottom + slop) continue;
		const distance = Math.hypot(x - (box.left + box.right) / 2, y - (box.top + box.bottom) / 2);
		if (distance < bestDistance) {
			best = box.id;
			bestDistance = distance;
		}
	}
	return best;
}
