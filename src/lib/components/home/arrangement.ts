/**
 * Which offer sits in which dynamic start page slot (issue #10). Pure functions over offer ids;
 * the page owns one arrangement and keeps it in the viewer's localStorage.
 *
 * Swiping keeps every other tile in place: the freed slot takes the first waiting offer, which
 * then drops in from above. Right (later) queues the offer at the end, left (away) parks it.
 */
export interface Arrangement {
	/** Offer id per dynamic slot, in slot order. */
	slots: readonly string[];
	/** Offers that move up next, first one first. */
	waiting: readonly string[];
	/** Offers swiped away, oldest first. They return only when nothing else waits. */
	away: readonly string[];
}

export type SwipeOutcome = 'later' | 'dismiss';

/** First `slotCount` offers fill the slots, the rest wait in pool order. */
export function initialArrangement(pool: readonly string[], slotCount: number): Arrangement {
	if (pool.length <= slotCount) throw new Error('The offer pool must be larger than the slots.');
	return { slots: pool.slice(0, slotCount), waiting: pool.slice(slotCount), away: [] };
}

/** Replaces the offer in `slot` with the first waiting one. */
export function swipeAway(
	arrangement: Arrangement,
	slot: number,
	outcome: SwipeOutcome
): Arrangement {
	const leaving = arrangement.slots[slot];
	const [arriving, ...rest] = arrangement.waiting;
	if (leaving === undefined || arriving === undefined) return arrangement;
	const slots = arrangement.slots.with(slot, arriving);
	if (outcome === 'later') return { slots, waiting: [...rest, leaving], away: arrangement.away };
	const away = [...arrangement.away, leaving];
	// Never run dry: when nothing waits, the offer parked longest comes back first.
	if (rest.length > 0) return { slots, waiting: rest, away };
	return { slots, waiting: away.slice(0, 1), away: away.slice(1) };
}

/** Moves the offer in slot `from` to slot `to`; the tiles in between shift by one. */
export function moveOffer(arrangement: Arrangement, from: number, to: number): Arrangement {
	const count = arrangement.slots.length;
	if (from === to || from < 0 || to < 0 || from >= count || to >= count) return arrangement;
	const slots = [...arrangement.slots];
	const [moving] = slots.splice(from, 1);
	slots.splice(to, 0, moving);
	return { ...arrangement, slots };
}

function isIdList(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * Reads a stored arrangement. Anything that does not hold exactly the current pool (an old
 * version, a renamed offer, a hand edit) falls back to the initial order.
 */
export function parseArrangement(
	stored: unknown,
	pool: readonly string[],
	slotCount: number
): Arrangement {
	const fallback = initialArrangement(pool, slotCount);
	if (typeof stored !== 'object' || stored === null) return fallback;
	const { slots, waiting, away } = stored as Record<string, unknown>;
	if (!isIdList(slots) || !isIdList(waiting) || !isIdList(away)) return fallback;
	if (slots.length !== slotCount || waiting.length === 0) return fallback;
	const ids = [...slots, ...waiting, ...away];
	const complete = ids.length === pool.length && pool.every((id) => ids.includes(id));
	return complete ? { slots, waiting, away } : fallback;
}

/** Apply visibility to all three queues so a finished exercise cannot reappear via refill. */
export function availableArrangement(
	arrangement: Arrangement,
	excluded: ReadonlySet<string>
): Arrangement {
	if (excluded.size === 0) return arrangement;
	const waiting = arrangement.waiting.filter((id) => !excluded.has(id));
	const away = arrangement.away.filter((id) => !excluded.has(id));
	const slots = arrangement.slots.flatMap((id) => {
		const visible = excluded.has(id) ? (waiting.shift() ?? away.shift()) : id;
		return visible === undefined ? [] : [visible];
	});
	if (waiting.length === 0 && away.length > 0) waiting.push(away.shift()!);
	return { slots, waiting, away };
}

export function offerColumns(importance: 'high' | 'normal'): 1 | 2 {
	return importance === 'high' ? 2 : 1;
}
