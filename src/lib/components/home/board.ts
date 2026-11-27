import type { ApiMode } from '../../api/types.js';
import { newestFirst, type QueueItem } from '../../learning-queue.js';
import { routeOpensInMode } from '../uebungen/stage-model.js';

export function homeTopics(items: readonly QueueItem[], mode: ApiMode): QueueItem[] {
	return newestFirst(items.filter((item) => routeOpensInMode(item.route, mode)));
}

/**
 * Which tiles stand on the start page, and in which order (issue #58). Pure functions over tile
 * ids; the page owns one board and keeps it in the viewer's localStorage.
 *
 * The areas of the app are the core: they always stand on the board. Topics from the shared
 * learning queue land in front of them. Only a few topics fit on one screen, the others wait
 * and move up as soon as a place is free.
 */
export interface Board {
	/** Tile ids on screen, most important first. The day tile is not part of the board. */
	shown: readonly string[];
	/** Topics that move up next, first one first. */
	waiting: readonly string[];
}

export type SwipeOutcome = 'later' | 'dismiss';

export function initialBoard(core: readonly string[]): Board {
	return { shown: [...core], waiting: [] };
}

function isIdList(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/** Reads a stored board; `syncBoard` repairs whatever no longer fits the core or the queue. */
export function parseBoard(stored: unknown): Board | undefined {
	if (typeof stored !== 'object' || stored === null) return undefined;
	const { shown, waiting } = stored as Record<string, unknown>;
	return isIdList(shown) && isIdList(waiting) ? { shown, waiting } : undefined;
}

export interface BoardSync {
	board: Board;
	/** Tiles that are new on screen, in board order. */
	arrived: readonly string[];
	/** Topics that left the screen to wait. */
	displaced: readonly string[];
}

/**
 * Brings a board in line with the core and the learning queue (`topics`, newest first).
 * New topics land in front. When more than `topicSlots` topics stand on the board, the last
 * ones give way and wait first in line. A free place takes the next waiting topic.
 */
export function syncBoard(
	board: Board,
	core: readonly string[],
	topics: readonly string[],
	topicSlots: number
): BoardSync {
	const isTopic = (id: string) => topics.includes(id);
	const known = (id: string) => core.includes(id) || isTopic(id);
	let shown = [...new Set(board.shown)].filter(known);
	let waiting = [...new Set(board.waiting)].filter((id) => isTopic(id) && !shown.includes(id));
	shown.push(...core.filter((id) => !shown.includes(id)));
	shown.unshift(...topics.filter((id) => !shown.includes(id) && !waiting.includes(id)));

	const onScreen = shown.filter(isTopic);
	const displaced = onScreen.slice(Math.max(0, topicSlots));
	shown = shown.filter((id) => !displaced.includes(id));
	waiting = [...displaced, ...waiting];
	const free = Math.max(0, topicSlots - onScreen.length);
	shown.unshift(...waiting.slice(0, free));
	waiting = waiting.slice(free);

	return {
		board: { shown, waiting },
		arrived: shown.filter((id) => !board.shown.includes(id)),
		displaced: displaced.filter((id) => board.shown.includes(id))
	};
}

/**
 * "Later": the tile goes to the back. While other topics wait, a topic joins the end of their
 * line and the first waiting one lands in front. A core tile only moves to the last place.
 */
export function sendBack(board: Board, id: string, core: readonly string[]): Board {
	if (!board.shown.includes(id)) return board;
	const rest = board.shown.filter((other) => other !== id);
	const [next, ...line] = board.waiting;
	if (core.includes(id) || next === undefined) return { ...board, shown: [...rest, id] };
	return { shown: [next, ...rest], waiting: [...line, id] };
}

/** Moves a tile to the place of `target`; the tiles in between shift by one. */
export function moveTile(board: Board, id: string, target: string): Board {
	const from = board.shown.indexOf(id);
	const to = board.shown.indexOf(target);
	if (from === to || from < 0 || to < 0) return board;
	const shown = board.shown.filter((other) => other !== id);
	shown.splice(to, 0, id);
	return { ...board, shown };
}
