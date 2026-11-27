/**
 * One pure surface function feeds mesh, physics and the hidden data table alike
 * (ui/DESIGN.md §9.3b, §9.3i). Plain TypeScript: no three, no Svelte.
 *
 * Coordinates: x and y span the floor, the height is z = f(x, y). three.js draws the height
 * along its Y axis; the scenes do that mapping themselves.
 */
export interface SurfaceFn {
	/** Height over the floor point. */
	height(x: number, y: number): number;
	/** Exact gradient (∂f/∂x, ∂f/∂y). */
	gradient(x: number, y: number): [number, number];
	/** Floor square [-extent, extent]² that the figure shows. */
	extent: number;
}

export interface Point {
	x: number;
	y: number;
}

/** Valley of gradient descent: f(x, y) = κ · x² + κ_y · y², minimum at the origin. */
export interface ValleyParams {
	/** Curvature along x, the axis the learning rate is read on (factor 1 − 2ηκ). */
	kappa: number;
	/** Gentler curvature along y; keeps the path curved instead of a straight line. */
	kappaY?: number;
	extent?: number;
}

export interface ValleySceneParams extends ValleyParams {
	eta: number;
	start: Point;
	/** Free roll in the lab, guided by exact steps in a worked solution. */
	free?: boolean;
	/** Same vertical scale on both sides of a comparison. */
	heightScale?: number;
}

export const VALLEY_KAPPA_Y = 0.35;
export const VALLEY_EXTENT = 1.5;
export const VALLEY_MARK_COUNT = 8;

export const VALLEY_COMPARISON = {
	eta: 0.085,
	start: { x: 1, y: 1 },
	kappa: 1,
	extent: 1.12,
	heightScale: 0.1
};

export function comparisonValleys() {
	return [
		{ ...VALLEY_COMPARISON, kappaY: 1 },
		{ ...VALLEY_COMPARISON, kappaY: 10 }
	] as const;
}

export function valley({
	kappa,
	kappaY = VALLEY_KAPPA_Y,
	extent = VALLEY_EXTENT
}: ValleyParams): SurfaceFn {
	return {
		extent,
		height: (x, y) => kappa * x * x + kappaY * y * y,
		gradient: (x, y) => [2 * kappa * x, 2 * kappaY * y]
	};
}

/** Exact gradient-descent steps w_{k+1} = w_k − η · ∇f(w_k); index 0 is the start. */
export function gradientSteps(fn: SurfaceFn, start: Point, eta: number, count: number): Point[] {
	const steps: Point[] = [{ ...start }];
	let { x, y } = start;
	for (let index = 0; index < count; index++) {
		const [gx, gy] = fn.gradient(x, y);
		x -= eta * gx;
		y -= eta * gy;
		steps.push({ x, y });
	}
	return steps;
}

/**
 * The one point sequence of a valley figure (§9.3b): 3D marks, the 2D sheet and the hidden data
 * table all read these exact gradient steps, in the lab as in a worked solution.
 */
export function valleyMarks(params: ValleySceneParams, count = VALLEY_MARK_COUNT): Point[] {
	return gradientSteps(valley(params), params.start, params.eta, count);
}

/** Factor by which the distance along x shrinks per step; |factor| ≥ 1 means no convergence. */
export function stepFactor(eta: number, kappa: number): number {
	return 1 - 2 * eta * kappa;
}

/** True when the gradient steps leave the valley instead of settling (|1 − 2ηκ| > 1). */
export function diverges(eta: number, kappa: number, kappaY = VALLEY_KAPPA_Y): boolean {
	return Math.abs(stepFactor(eta, kappa)) > 1 || Math.abs(stepFactor(eta, kappaY)) > 1;
}

/** Height samples on an n × n grid over the shown square (mesh and data table share them). */
export function sampleGrid(fn: SurfaceFn, n: number): { x: number; y: number; z: number }[][] {
	const rows: { x: number; y: number; z: number }[][] = [];
	for (let j = 0; j < n; j++) {
		const row: { x: number; y: number; z: number }[] = [];
		const y = -fn.extent + (2 * fn.extent * j) / (n - 1);
		for (let i = 0; i < n; i++) {
			const x = -fn.extent + (2 * fn.extent * i) / (n - 1);
			row.push({ x, y, z: fn.height(x, y) });
		}
		rows.push(row);
	}
	return rows;
}

/** Softmax with temperature; `masked` entries get weight 0 (the causal half). */
export function softmax(scores: readonly number[], temperature = 1, masked?: readonly boolean[]) {
	const live = scores.map((score, index) => (masked?.[index] ? -Infinity : score / temperature));
	const top = Math.max(...live);
	const exps = live.map((value) => (value === -Infinity ? 0 : Math.exp(value - top)));
	const sum = exps.reduce((total, value) => total + value, 0);
	return exps.map((value) => value / sum);
}

/**
 * Attention weights of a causal head: row i sees tokens 0…i. Scores are divided by √d_k when
 * `scaled`, then by the temperature T.
 */
export function attentionWeights(
	scores: readonly (readonly number[])[],
	options: { temperature: number; scaled: boolean; keyDimension: number }
): number[][] {
	const divisor = options.scaled ? Math.sqrt(options.keyDimension) : 1;
	return scores.map((row, i) =>
		softmax(
			row.map((score) => score / divisor),
			options.temperature,
			row.map((_, j) => j > i)
		)
	);
}
