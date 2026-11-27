import type { WhiteboardSnapshot } from '$lib/api/types';

import { INKS, clampUnit, type Point, type Stroke } from '../../modules/board-canvas/strokes.js';

export {
	INKS,
	clampUnit,
	distanceToSegment,
	strokeHit,
	type InkColor,
	type Point,
	type Stroke
} from '../../modules/board-canvas/strokes.js';

/** The part of the unit square a board shows: its width and height divided by its long side. */
export interface View {
	x: number;
	y: number;
}

// Same limit as isWhiteboardSnapshot in the API contract.
export const MAX_POINTS = 5_000;
// Four decimals resolve 0.1 px on a 1000 px board and keep the payload small.
const COORDINATE_PRECISION = 10_000;

export function countPoints(strokes: readonly Stroke[]): number {
	return strokes.reduce((total, stroke) => total + stroke.points.length, 0);
}

function round(value: number): number {
	return Math.round(clampUnit(value) * COORDINATE_PRECISION) / COORDINATE_PRECISION;
}

export function toSnapshot(
	strokes: readonly Stroke[],
	boardId: string,
	revision: number
): WhiteboardSnapshot {
	return {
		boardId,
		revision,
		strokes: strokes
			.filter((stroke) => stroke.points.length > 0)
			.map((stroke) => ({
				points: stroke.points.map(({ x, y }) => ({ x: round(x), y: round(y) }))
			}))
	};
}

/** The snapshot carries no colours; strokes come back in ink. */
export function fromSnapshot(snapshot: WhiteboardSnapshot): Stroke[] {
	return snapshot.strokes.map((stroke) => ({
		color: INKS[0].color,
		points: stroke.points.map(({ x, y }) => ({ x, y }))
	}));
}

export interface Bounds {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

export function strokeBounds(strokes: readonly Stroke[]): Bounds | null {
	let bounds: Bounds | null = null;
	for (const { points } of strokes) {
		for (const { x, y } of points) {
			bounds = bounds
				? {
						minX: Math.min(bounds.minX, x),
						minY: Math.min(bounds.minY, y),
						maxX: Math.max(bounds.maxX, x),
						maxY: Math.max(bounds.maxY, y)
					}
				: { minX: x, minY: y, maxX: x, maxY: y };
		}
	}
	return bounds;
}

/**
 * A sketch from another screen (an older 4:3 board, a desktop) may reach past what this board
 * shows. Then it is moved to the margin and scaled down uniformly until it fits; a sketch that
 * already fits stays untouched.
 */
export function fitStrokes(strokes: readonly Stroke[], view: View, margin = 0.02): Stroke[] {
	const bounds = strokeBounds(strokes);
	if (!bounds || (bounds.maxX <= view.x && bounds.maxY <= view.y)) return [...strokes];
	const width = Math.max(bounds.maxX - bounds.minX, Number.EPSILON);
	const height = Math.max(bounds.maxY - bounds.minY, Number.EPSILON);
	const scale = Math.min((view.x - 2 * margin) / width, (view.y - 2 * margin) / height, 1);
	return strokes.map((stroke) => ({
		color: stroke.color,
		points: stroke.points.map(({ x, y }) => ({
			x: clampUnit(margin + (x - bounds.minX) * scale),
			y: clampUnit(margin + (y - bounds.minY) * scale)
		}))
	}));
}

/**
 * Where the tutor's hairline ends: a real ink point at the top of the sketch, or at the bottom
 * when the reply has to sit below it. The tutor never draws into the sketch; it only points.
 */
export function anchorPoint(strokes: readonly Stroke[], edge: 'top' | 'bottom'): Point | null {
	let best: Point | null = null;
	for (const { points } of strokes) {
		for (const point of points) {
			if (!best || (edge === 'top' ? point.y < best.y : point.y > best.y)) best = point;
		}
	}
	return best;
}

/** Export units: the long side of the board becomes 1000, the stroke keeps its screen weight. */
const SVG_UNITS = 1000;
const SVG_STROKE = 3;

function svgNumber(value: number): string {
	return String(Math.round(value * SVG_UNITS * 10) / 10);
}

/**
 * One export format, no choice (art direction V2-6): SVG keeps both inks as vectors and stays
 * small. The view box is the visible board on white.
 */
export function toSvg(strokes: readonly Stroke[], view: View): string {
	const width = svgNumber(view.x);
	const height = svgNumber(view.y);
	const marks = strokes
		.filter((stroke) => stroke.points.length > 0)
		.map(({ color, points }) => {
			if (points.length === 1) {
				const [{ x, y }] = points;
				return `<circle cx="${svgNumber(x)}" cy="${svgNumber(y)}" r="${SVG_STROKE / 2}" fill="${color}"/>`;
			}
			const line = points.map(({ x, y }) => `${svgNumber(x)},${svgNumber(y)}`).join(' ');
			return `<polyline points="${line}" fill="none" stroke="${color}" stroke-width="${SVG_STROKE}" stroke-linecap="round" stroke-linejoin="round"/>`;
		});
	return [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
		`<rect width="${width}" height="${height}" fill="#FFFFFF"/>`,
		...marks,
		'</svg>'
	].join('\n');
}
