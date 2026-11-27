/**
 * Pure geometry of the FigurePlate marks (ui/DESIGN.md §11 P7, konzept Z2). Plain numbers in
 * viewBox units; no DOM, no Svelte, so every mark's layout is testable in Node.
 */

/** A point in viewBox units. */
export interface Point {
	x: number;
	y: number;
}

/** The plot box inside the viewBox. */
export interface Box {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/** Linear map from a domain onto a range; a flat domain maps to the range's start. */
export function linear(
	[d0, d1]: readonly [number, number],
	[r0, r1]: readonly [number, number]
): (value: number) => number {
	const span = d1 - d0;
	return (value) => (span === 0 ? r0 : r0 + ((value - d0) / span) * (r1 - r0));
}

/** The smallest domain that holds every value and zero, so bars always stand on a baseline. */
export function domainWithZero(values: readonly number[]): [number, number] {
	return [Math.min(0, ...values), Math.max(0, ...values)];
}

/** Share of the viewBox in percent, for HTML placed over the SVG (text never sits in the SVG). */
export function percent(value: number, total: number): number {
	return total === 0 ? 0 : (value / total) * 100;
}

/**
 * Quadrat im Quadrat: a share as area, not as opacity (konzept Z2). Returns the side of the
 * inner square whose area is `share` of the outer one, clamped to 0…1.
 */
export function innerSide(share: number, side: number): number {
	const clamped = Math.min(1, Math.max(0, Number.isFinite(share) ? share : 0));
	return Math.sqrt(clamped) * side;
}

export interface BarInput {
	value: number;
	/** Bars with the same group key in a row share one group label and stand closer. */
	group?: string;
}

export interface BarRect {
	index: number;
	/** Centre of the bar. */
	x: number;
	width: number;
	/** Top edge and height of the drawn rectangle (always ≥ 0). */
	y: number;
	height: number;
	/** The end of the bar away from the baseline: where its value callout points. */
	tip: Point;
	negative: boolean;
}

export interface BarGroup {
	key: string;
	/** Centre under the group and the first and last bar index. */
	x: number;
	from: number;
	to: number;
}

export interface BarLayout {
	bars: BarRect[];
	groups: BarGroup[];
	baseline: number;
}

/** Runs of consecutive bars with the same group key. */
function groupRuns(bars: readonly BarInput[]): { key: string; from: number; to: number }[] {
	const runs: { key: string; from: number; to: number }[] = [];
	bars.forEach((bar, index) => {
		const key = bar.group ?? '';
		const last = runs.at(-1);
		if (last && last.key === key && key !== '') last.to = index;
		else runs.push({ key, from: index, to: index });
	});
	return runs;
}

/**
 * Bars on one baseline: equal slots, half a slot between groups, bars half a slot wide. Negative
 * values hang below the baseline. Heights are measured from the baseline, never from the box edge.
 */
export function layoutBars(
	bars: readonly BarInput[],
	box: Box,
	domain?: [number, number]
): BarLayout {
	const runs = groupRuns(bars);
	const gaps = Math.max(0, runs.length - 1) * 0.5;
	const slot = (box.right - box.left) / Math.max(1, bars.length + gaps);
	const y = linear(domain ?? domainWithZero(bars.map((bar) => bar.value)), [box.bottom, box.top]);
	const baseline = y(0);
	const rects: BarRect[] = [];
	let cursor = box.left;
	runs.forEach((run, runIndex) => {
		if (runIndex > 0) cursor += slot * 0.5;
		for (let index = run.from; index <= run.to; index += 1) {
			const x = cursor + slot / 2;
			const end = y(bars[index].value);
			const negative = bars[index].value < 0;
			rects.push({
				index,
				x,
				width: slot * 0.5,
				y: Math.min(end, baseline),
				height: Math.abs(baseline - end),
				tip: { x, y: end },
				negative
			});
			cursor += slot;
		}
	});
	const groups = runs
		.filter((run) => run.key !== '')
		.map((run) => ({
			key: run.key,
			from: run.from,
			to: run.to,
			x: (rects[run.from].x + rects[run.to].x) / 2
		}));
	return { bars: rects, groups, baseline };
}

/** A polyline through points in data space, as an SVG path in viewBox units. */
export function polylinePath(
	points: readonly Point[],
	x: (value: number) => number,
	y: (value: number) => number
): string {
	return points
		.map((point, index) => `${index ? 'L' : 'M'}${round(x(point.x))} ${round(y(point.y))}`)
		.join(' ');
}

/** A line from `from` towards `to`, stopped `gap` units short of both ends (edges between nodes). */
export function trimmedLine(from: Point, to: Point, gap: number): [Point, Point] {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const length = Math.hypot(dx, dy);
	if (length <= 2 * gap) return [from, to];
	const ux = dx / length;
	const uy = dy / length;
	return [
		{ x: from.x + ux * gap, y: from.y + uy * gap },
		{ x: to.x - ux * gap, y: to.y - uy * gap }
	];
}

/**
 * Isometric projection (30°) of a point on a horizontal layer: `u` runs right-down, `v` left-down,
 * `z` is the height of the layer. Returns viewBox units around `origin`.
 */
export function isometric(origin: Point, u: number, v: number, z: number): Point {
	const cos = Math.cos(Math.PI / 6);
	return { x: origin.x + (u - v) * cos, y: origin.y + (u + v) * 0.5 - z };
}

/** The top face of an isometric square layer of side `size`, centred on `origin`. */
export function isometricSquare(origin: Point, size: number, z: number): Point[] {
	const half = size / 2;
	return [
		isometric(origin, -half, -half, z),
		isometric(origin, half, -half, z),
		isometric(origin, half, half, z),
		isometric(origin, -half, half, z)
	];
}

export function pointsAttribute(points: readonly Point[]): string {
	return points.map((point) => `${round(point.x)},${round(point.y)}`).join(' ');
}

/** Two decimals are below a screen pixel at any plate width. */
export function round(value: number): number {
	return Math.round(value * 100) / 100;
}

/** Parses `0 0 320 200`; anything else falls back to the plate's default 320 × 200. */
export function parseViewBox(viewBox: string): { width: number; height: number } {
	const parts = viewBox
		.trim()
		.split(/[\s,]+/)
		.map(Number);
	if (parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0) {
		return { width: parts[2], height: parts[3] };
	}
	return { width: 320, height: 200 };
}

/** German number with a real minus sign (DESIGN.md §6.5): `−17`, `99,995`, `0,0045`. */
export function formatNumber(value: number): string {
	return value.toLocaleString('de-DE', { maximumSignificantDigits: 5 }).replace('-', '−');
}
