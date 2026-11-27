/**
 * List state of /uebungen for this session: done tasks, and what the learner swiped
 * away or put back. Nothing leaves the browser tab; the learning record stays with the API.
 */
type SwipeAction = 'later' | 'dismiss';

export const practice = $state({
	/** Task ids answered with `korrekt` in this session. */
	done: [] as string[],
	/** Task ids moved to the end, in the order they were moved. */
	later: [] as string[],
	/** Task ids swiped away. */
	hidden: [] as string[],
	/** The last swipe; its undo line stays until the learner acts elsewhere (no timer). */
	pending: null as { id: string; action: SwipeAction } | null,
	/** Remount counter per row: a new value ends that row's undo line. */
	generations: {} as Record<string, number>
});

/** Applies the pending swipe: later moves the row to the end, away hides it. */
export function settleSwipe(): void {
	const pending = practice.pending;
	if (!pending) return;
	practice.pending = null;
	const { id, action } = pending;
	if (action === 'later') practice.later = [...practice.later.filter((entry) => entry !== id), id];
	else if (!practice.hidden.includes(id)) practice.hidden = [...practice.hidden, id];
	practice.generations = { ...practice.generations, [id]: (practice.generations[id] ?? 0) + 1 };
}

export function swiped(id: string, action: SwipeAction): void {
	settleSwipe();
	practice.pending = { id, action };
}

export function unswiped(id: string): void {
	if (practice.pending?.id === id) practice.pending = null;
}

export function markDone(id: string): void {
	if (!practice.done.includes(id)) practice.done = [...practice.done, id];
}

/** Starts a new run of the exercise list; API learning records are independent. */
export function resetPractice(): void {
	practice.done = [];
	practice.later = [];
	practice.hidden = [];
	practice.pending = null;
	practice.generations = {};
}
