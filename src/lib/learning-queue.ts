/**
 * The shared learning queue (issues #58 and #62), the one source for every page. `/aktivitaet` and
 * other pages put topics into it, the start page lets them fall into its grid. The queue lives in
 * the viewer's localStorage; whoever changes it announces that with a CustomEvent on `window`
 * whose `detail` is the valid queue after the change.
 *
 * Reading is tolerant: broken or foreign entries are dropped from what a page shows. Writing keeps
 * them as they were stored, so a page never loses what another version wrote, and a foreign entry
 * never blocks a change.
 */
export const LEARNING_QUEUE_KEY = 'tutor.learning-queue.v1';
export const LEARNING_QUEUE_EVENT = 'tutor:learning-queue';

export const QUEUE_TYPES = [
	'exercise',
	'explanation',
	'magazine',
	'whiteboard',
	'activity'
] as const;
export type QueueType = (typeof QUEUE_TYPES)[number];

export interface QueueItem {
	id: string;
	title: string;
	/** A path inside the app, e.g. `/erklaerungen` or `/magazin/slug`. */
	route: string;
	type: QueueType;
	addedAt: number;
}

/** What a page hands in; the time is set when the topic is written. */
export type QueueTopic = Omit<QueueItem, 'addedAt'>;

/** One entry taken out of the stored queue, exactly as it was written, and where it stood. */
export interface RemovedEntry {
	entry: unknown;
	index: number;
}

export type QueueStorage = Pick<Storage, 'getItem' | 'setItem'>;

const MAX_TITLE_WORDS = 3;

/** Only paths of this app: no other origin, no script URL. */
export function isAppRoute(route: string): boolean {
	return /^\/(?![/\\])[^\s\\]*$/.test(route);
}

function parseItem(value: unknown): QueueItem | undefined {
	if (typeof value !== 'object' || value === null) return undefined;
	const { id, title, route, type, addedAt } = value as Record<string, unknown>;
	if (typeof id !== 'string' || id === '') return undefined;
	if (typeof title !== 'string' || title.trim() === '') return undefined;
	if (typeof route !== 'string' || !isAppRoute(route)) return undefined;
	if (!QUEUE_TYPES.includes(type as QueueType)) return undefined;
	const time = typeof addedAt === 'number' && Number.isFinite(addedAt) ? addedAt : 0;
	return {
		id,
		title: title.trim().replace(/\s+/g, ' '),
		route,
		type: type as QueueType,
		addedAt: time
	};
}

/** Keeps every valid entry once; anything else in the stored value is ignored. */
export function parseLearningQueue(stored: unknown): QueueItem[] {
	if (!Array.isArray(stored)) return [];
	const items = new Map<string, QueueItem>();
	for (const value of stored) {
		const item = parseItem(value);
		if (item && !items.has(item.id)) items.set(item.id, item);
	}
	return [...items.values()];
}

/** Newest topic first; entries of the same moment keep their stored order. */
export function newestFirst(items: readonly QueueItem[]): QueueItem[] {
	return [...items].sort((a, b) => b.addedAt - a.addedAt);
}

/** The one visible line of a tile: at most three words. */
export function shortTitle(title: string): string {
	return title.trim().split(/\s+/).slice(0, MAX_TITLE_WORDS).join(' ');
}

/** The stored queue as text, or undefined when storage is blocked. */
export function readLearningQueueText(storage: QueueStorage): string | null | undefined {
	try {
		return storage.getItem(LEARNING_QUEUE_KEY);
	} catch {
		return undefined;
	}
}

export function parseLearningQueueText(text: string | null | undefined): QueueItem[] {
	if (!text) return [];
	try {
		return parseLearningQueue(JSON.parse(text));
	} catch {
		return [];
	}
}

/** The valid queue, or undefined when storage is blocked. Never throws. */
export function readLearningQueue(storage: QueueStorage): QueueItem[] | undefined {
	const text = readLearningQueueText(storage);
	return text === undefined ? undefined : parseLearningQueueText(text);
}

/**
 * The stored list as written, foreign entries included. A missing or unreadable value counts as
 * an empty list, so a broken store never locks the learner out. Throws when storage is blocked.
 */
function storedEntries(storage: QueueStorage): unknown[] {
	const text = storage.getItem(LEARNING_QUEUE_KEY);
	if (!text) return [];
	try {
		const value: unknown = JSON.parse(text);
		return Array.isArray(value) ? value : [];
	} catch {
		return [];
	}
}

/** Writes the list and announces the valid queue; returns it, or undefined when nothing was written. */
function write(
	storage: QueueStorage,
	entries: readonly unknown[],
	events?: EventTarget
): QueueItem[] | undefined {
	try {
		storage.setItem(LEARNING_QUEUE_KEY, JSON.stringify(entries));
	} catch {
		return undefined;
	}
	const items = parseLearningQueue(entries);
	events?.dispatchEvent(new CustomEvent(LEARNING_QUEUE_EVENT, { detail: items }));
	return items;
}

/** A topic a page may write: a non-empty id and title, a known type and a path of this app. */
function validTopic(topic: QueueTopic): boolean {
	return (
		typeof topic.id === 'string' &&
		topic.id !== '' &&
		typeof topic.title === 'string' &&
		topic.title.trim() !== '' &&
		typeof topic.route === 'string' &&
		isAppRoute(topic.route) &&
		QUEUE_TYPES.includes(topic.type)
	);
}

/**
 * Puts a topic in, or takes it out when it is already there. Reads at click time, so changes from
 * the start page or another tab are kept. Returns the valid queue after the write, or undefined
 * when the topic is invalid or storage refused the write.
 */
export function toggleLearningQueue(
	storage: QueueStorage,
	events: EventTarget | undefined,
	topic: QueueTopic,
	now = Date.now()
): QueueItem[] | undefined {
	if (!validTopic(topic)) return undefined;
	try {
		const entries = storedEntries(storage);
		const queued = entries.some((entry) => parseItem(entry)?.id === topic.id);
		const item: QueueItem = {
			id: topic.id,
			title: topic.title.trim().replace(/\s+/g, ' '),
			route: topic.route,
			type: topic.type,
			addedAt: now
		};
		const next = queued
			? entries.filter((entry) => parseItem(entry)?.id !== topic.id)
			: [...entries, item];
		return write(storage, next, events);
	} catch {
		return undefined;
	}
}

/**
 * Takes one topic out of the stored queue and leaves every other entry as it was written,
 * including fields this page does not know. Returns the valid queue after the write and the entry
 * taken out (for undo), or undefined when nothing could be written.
 */
export function removeFromLearningQueue(
	storage: QueueStorage,
	id: string,
	events?: EventTarget
): { items: QueueItem[]; removed?: RemovedEntry } | undefined {
	try {
		const entries = storedEntries(storage);
		const index = entries.findIndex((entry) => parseItem(entry)?.id === id);
		const rest = entries.filter((entry) => parseItem(entry)?.id !== id);
		const items = write(storage, rest, events);
		if (!items) return undefined;
		return index < 0 ? { items } : { items, removed: { entry: entries[index], index } };
	} catch {
		return undefined;
	}
}

/**
 * Undo: puts the one removed entry back into the queue as it stands now, at its old place where
 * that still exists. Changes made meanwhile, here or in another tab, stay. A topic that is back
 * already is not doubled. Returns the valid queue, or undefined when nothing could be written.
 */
export function restoreToLearningQueue(
	storage: QueueStorage,
	removed: RemovedEntry,
	events?: EventTarget
): QueueItem[] | undefined {
	try {
		const entries = storedEntries(storage);
		const id = parseItem(removed.entry)?.id;
		if (entries.some((entry) => parseItem(entry)?.id === id))
			return write(storage, entries, events);
		const at = Math.max(0, Math.min(removed.index, entries.length));
		return write(storage, [...entries.slice(0, at), removed.entry, ...entries.slice(at)], events);
	} catch {
		return undefined;
	}
}
