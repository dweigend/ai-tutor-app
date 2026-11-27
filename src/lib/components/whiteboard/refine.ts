import { countPoints, distanceToSegment, type Point, type Stroke } from './strokes.js';

/**
 * "Aufbereiten": turns a hand sketch into a clean one. The seam is ready for a model behind the
 * API (`mode: 'api'`); the contract has no such endpoint yet, so the app uses the honest demo:
 * a local line simplification without any model. The board says so ("Demo").
 */
export interface RefineResult {
	strokes: Stroke[];
	pointsBefore: number;
	pointsAfter: number;
}

export interface SketchRefiner {
	readonly mode: 'demo' | 'api';
	refine(strokes: readonly Stroke[], signal?: AbortSignal): Promise<RefineResult>;
}

/** Tolerance in board units (long side = 1): about 5 px on a phone. Wobble goes, corners stay. */
export const REFINE_TOLERANCE = 0.006;

/** Ramer–Douglas–Peucker: keeps the points that carry the shape, drops the hand's tremor. */
export function simplifyPoints(points: readonly Point[], tolerance = REFINE_TOLERANCE): Point[] {
	if (points.length < 3) return [...points];
	const keep = new Array<boolean>(points.length).fill(false);
	keep[0] = keep[points.length - 1] = true;
	const spans: [number, number][] = [[0, points.length - 1]];
	while (spans.length) {
		const [from, to] = spans.pop()!;
		let farthest = -1;
		let distance = tolerance;
		for (let index = from + 1; index < to; index += 1) {
			const current = distanceToSegment(points[index], points[from], points[to]);
			if (current > distance) {
				distance = current;
				farthest = index;
			}
		}
		if (farthest === -1) continue;
		keep[farthest] = true;
		spans.push([from, farthest], [farthest, to]);
	}
	return points.filter((_, index) => keep[index]);
}

export function refineLocally(strokes: readonly Stroke[]): RefineResult {
	const refined = strokes.map((stroke) => ({
		color: stroke.color,
		points: simplifyPoints(stroke.points)
	}));
	return {
		strokes: refined,
		pointsBefore: countPoints(strokes),
		pointsAfter: countPoints(refined)
	};
}

export const demoRefiner: SketchRefiner = {
	mode: 'demo',
	async refine(strokes, signal) {
		if (signal?.aborted) throw new DOMException('Abgebrochen.', 'AbortError');
		return refineLocally(strokes);
	}
};
