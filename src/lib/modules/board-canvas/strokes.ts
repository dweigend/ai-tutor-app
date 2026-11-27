/** Two pen colours only (ui/DESIGN.md §5, art direction V2-6): ink for structure, orange for the
 * active quantity. No third colour. Hex values are data here: the canvas and the SVG export need
 * them; the UI reads the matching roles (--text, --grip). */
export const INKS = [
	{ color: '#0A0A0A', name: 'Tinte' },
	{ color: '#E85D1A', name: 'Orange' }
] as const;

export type InkColor = (typeof INKS)[number]['color'];

export interface Point {
	x: number;
	y: number;
}

/**
 * Points are normalised by the long side of the board: one factor for both axes. The board can
 * then fill any screen without distorting a shape, and every coordinate stays within [0, 1] as
 * the snapshot contract demands. On a portrait phone x runs to about 0.46, y to 1.
 */
export interface Stroke {
	color: InkColor;
	points: Point[];
}

export function clampUnit(value: number): number {
	return Math.min(Math.max(value, 0), 1);
}

/** Distance from a point to the segment between two points, in board units. */
export function distanceToSegment(point: Point, from: Point, to: Point): number {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const lengthSquared = dx * dx + dy * dy;
	const t =
		lengthSquared === 0
			? 0
			: clampUnit(((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared);
	return Math.hypot(point.x - (from.x + t * dx), point.y - (from.y + t * dy));
}

/** True when the eraser at `point` (board units) touches the stroke. */
export function strokeHit(stroke: Stroke, point: Point, radius: number): boolean {
	const { points } = stroke;
	if (points.length === 1)
		return Math.hypot(points[0].x - point.x, points[0].y - point.y) <= radius;
	return points.slice(1).some((to, index) => distanceToSegment(point, points[index], to) <= radius);
}
