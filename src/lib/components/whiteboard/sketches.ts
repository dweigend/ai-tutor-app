import { INKS, MAX_POINTS, countPoints, type InkColor, type Stroke } from './strokes.js';

/**
 * Saved sketches: a local history in the browser, nothing leaves the device (design principle
 * "Gedächtnis lokal"). Newest first. Swiping right keeps a sketch ("Später"), so the limit never
 * pushes it out; swiping left removes it ("Weg").
 */
export interface SavedSketch {
	id: string;
	/** ISO time of saving. */
	savedAt: string;
	strokes: Stroke[];
	kept: boolean;
}

export const SKETCH_LIMIT = 12;
export const SKETCH_STORAGE_KEY = 'tutor.whiteboard.sketches.v1';

/** Adds a sketch on top; beyond the limit the oldest sketch that is not kept goes first. */
export function addSketch(list: readonly SavedSketch[], sketch: SavedSketch): SavedSketch[] | null {
	const previous = list.filter((item) => item.id !== sketch.id);
	if (previous.length >= SKETCH_LIMIT) {
		const index = previous.findLastIndex((item) => !item.kept);
		if (index === -1) return null;
		previous.splice(index, 1);
	}
	return [sketch, ...previous];
}

export function removeSketches(list: readonly SavedSketch[], ids: ReadonlySet<string>) {
	return list.filter((item) => !ids.has(item.id));
}

export function keepSketch(list: readonly SavedSketch[], id: string, kept: boolean) {
	return list.map((item) => (item.id === id ? { ...item, kept } : item));
}

const INK_SET = new Set<string>(INKS.map((ink) => ink.color));

function isUnit(value: unknown): value is number {
	return typeof value === 'number' && value >= 0 && value <= 1;
}

function parseStroke(value: unknown): Stroke | null {
	if (typeof value !== 'object' || value === null) return null;
	const { color, points } = value as { color?: unknown; points?: unknown };
	if (typeof color !== 'string' || !INK_SET.has(color) || !Array.isArray(points)) return null;
	if (!points.length) return null;
	const parsed = points.map((point: unknown) => {
		const { x, y } = (point ?? {}) as { x?: unknown; y?: unknown };
		return isUnit(x) && isUnit(y) ? { x, y } : null;
	});
	if (parsed.some((point) => point === null)) return null;
	return { color: color as InkColor, points: parsed as Stroke['points'] };
}

function parseSketch(value: unknown): SavedSketch | null {
	if (typeof value !== 'object' || value === null) return null;
	const { id, savedAt, strokes, kept } = value as Record<string, unknown>;
	if (typeof id !== 'string' || !id || typeof savedAt !== 'string') return null;
	if (Number.isNaN(Date.parse(savedAt)) || !Array.isArray(strokes) || !strokes.length) return null;
	const parsed = strokes.map(parseStroke);
	if (parsed.some((stroke) => stroke === null)) return null;
	const valid = parsed as Stroke[];
	if (countPoints(valid) > MAX_POINTS) return null;
	return { id, savedAt, strokes: valid, kept: kept === true };
}

/** Reads what the storage holds; anything broken or foreign is dropped, never trusted. */
export function parseSketches(raw: string | null): SavedSketch[] {
	if (!raw) return [];
	let data: unknown;
	try {
		data = JSON.parse(raw);
	} catch {
		return [];
	}
	if (!Array.isArray(data)) return [];
	return data
		.map(parseSketch)
		.filter((item): item is SavedSketch => item !== null)
		.slice(0, SKETCH_LIMIT);
}

type SketchStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function readSketches(storage: SketchStorage | undefined): SavedSketch[] {
	try {
		return parseSketches(storage?.getItem(SKETCH_STORAGE_KEY) ?? null);
	} catch {
		return [];
	}
}

/** False when the browser refuses (private mode, quota); the list then lives for this visit. */
export function writeSketches(storage: SketchStorage | undefined, list: readonly SavedSketch[]) {
	if (!storage) return false;
	try {
		storage.setItem(SKETCH_STORAGE_KEY, JSON.stringify(list));
		return true;
	} catch {
		return false;
	}
}

function pad(value: number): string {
	return String(value).padStart(2, '0');
}

/** "26.11. · 14:32", the local time of saving. */
export function sketchTime(savedAt: string): string {
	const date = new Date(savedAt);
	return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}. · ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "skizze-2026-11-26-1432.svg" */
export function exportFileName(date: Date): string {
	const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
	return `skizze-${day}-${pad(date.getHours())}${pad(date.getMinutes())}.svg`;
}
