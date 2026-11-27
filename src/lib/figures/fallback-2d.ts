/**
 * The standing 2D sheet (ui/DESIGN.md §4.8, §9.3f): without WebGL, after a lost context, with
 * save-data or reduced motion. It shows the end state at once: the complete trail and numbered
 * marks, computed from the same surface function and integrator as the 3D figure. Pure
 * geometry for an SVG; the Svelte component draws it. No three.
 */
import { simulate } from './physics.js';
import {
	VALLEY_KAPPA_Y,
	VALLEY_MARK_COUNT,
	valley,
	valleyMarks,
	type Point,
	type ValleySceneParams
} from './surface.js';

export interface SheetMark {
	x: number;
	y: number;
	/** Number shown next to the mark: 0 is the start. */
	label: number;
	/** Outside the shown square: the steps diverge. */
	stray: boolean;
}

export interface ValleySheet {
	size: number;
	endHeight: number;
	contours: string[];
	frame: string;
	marks: SheetMark[];
	/** Floor coordinates of the marks: the exact gradient steps the data table lists. */
	points: Point[];
	/** Straight lines between the marks. */
	steps: string;
	/** The ball at the end of the simulated roll. */
	ball: Point;
	prediction: Point | null;
	/** Keyboard cursor of the 2D prediction, if one is shown. */
	cursor: Point | null;
}

const LEVELS = [0.15, 0.4, 0.8, 1.35, 2];

/** Top view of the valley: contour lines, step marks, the ball where the roll ends. */
export function drawValleySheet(
	options: ValleySceneParams & {
		prediction: Point | null;
		/** Keyboard cursor on the floor; drawn as an open square until Enter sets it. */
		cursor?: Point | null;
		size?: number;
		marks?: number;
		/** The exact steps the caller already lists; computed from the params when omitted. */
		steps?: readonly Point[];
	}
): ValleySheet {
	const size = options.size ?? 320;
	const fn = valley(options);
	const kappaY = options.kappaY ?? VALLEY_KAPPA_Y;
	const e = fn.extent;
	const pad = 12;
	const scale = (size - 2 * pad) / (2 * e);
	const sx = (x: number) => pad + (Math.min(Math.max(x, -e), e) + e) * scale;
	// Floor y grows away from the viewer; on the sheet it points up.
	const sy = (y: number) => pad + (e - Math.min(Math.max(y, -e), e)) * scale;
	const round = (value: number) => Math.round(value * 100) / 100;

	const contours = LEVELS.map((level) => {
		const rx = Math.sqrt(level / options.kappa);
		const ry = Math.sqrt(level / kappaY);
		const parts: string[] = [];
		let open = false;
		for (let k = 0; k <= 96; k++) {
			const a = (2 * Math.PI * k) / 96;
			const x = rx * Math.cos(a);
			const y = ry * Math.sin(a);
			if (Math.abs(x) > e || Math.abs(y) > e) {
				open = false;
				continue;
			}
			parts.push(`${open ? 'L' : 'M'}${round(sx(x))} ${round(sy(y))}`);
			open = true;
		}
		return parts.join('');
	});

	const points = (options.steps ?? valleyMarks(options, options.marks ?? VALLEY_MARK_COUNT)).map(
		(point) => ({ ...point })
	);
	// The ball rolls by physics in the lab and from mark to mark in a worked solution; the marks
	// themselves are always the exact gradient steps (§9.3b), so sheet and table never part.
	const { integrator } = simulate(fn, options.start, {
		hz: 60,
		seconds: 20,
		marks: options.free ? [] : points
	});
	const end = integrator.current;
	const marks = points.map((step, label) => ({
		x: round(sx(step.x)),
		y: round(sy(step.y)),
		label,
		stray: Math.abs(step.x) > e || Math.abs(step.y) > e
	}));
	return {
		size,
		endHeight: fn.height(end.x, end.y),
		contours,
		frame: `M${pad} ${pad}H${size - pad}V${size - pad}H${pad}Z`,
		marks,
		points,
		steps: marks.map((mark, index) => `${index ? 'L' : 'M'}${mark.x} ${mark.y}`).join(''),
		ball: { x: round(sx(end.x)), y: round(sy(end.y)) },
		prediction: options.prediction
			? { x: round(sx(options.prediction.x)), y: round(sy(options.prediction.y)) }
			: null,
		cursor: options.cursor
			? { x: round(sx(options.cursor.x)), y: round(sy(options.cursor.y)) }
			: null
	};
}

export interface ReliefSheetCell {
	row: number;
	col: number;
	/** Side of the square, proportional to the square root of the weight (area = weight). */
	side: number;
	x: number;
	y: number;
	masked: boolean;
}

/** Top view of the relief: one square per weight, the masked half left empty. */
export function drawReliefSheet(
	weights: readonly (readonly number[])[],
	cell = 48
): { size: number; cells: ReliefSheetCell[] } {
	const cells: ReliefSheetCell[] = [];
	weights.forEach((row, i) =>
		row.forEach((weight, j) => {
			const side = Math.round(Math.sqrt(Math.max(weight, 0)) * (cell - 4) * 100) / 100;
			cells.push({
				row: i,
				col: j,
				side,
				x: j * cell + (cell - side) / 2,
				y: i * cell + (cell - side) / 2,
				masked: j > i
			});
		})
	);
	return { size: weights.length * cell, cells };
}
