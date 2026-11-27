/**
 * The valley of gradient descent (ui/DESIGN.md §1, §9.3): a 21 × 21 surface drawn as ink
 * hairlines on paper, contour lines on the floor, the 45° print raster on the faces turned away
 * from the light while the figure stands, an orange ball with an ink outline and a plumb line to
 * the floor. The ball rolls with momentum from mark to mark (the exact gradient steps), then
 * freely into the valley; the marks appear as it reaches them (squares and lines). A yellow
 * square is the learner's own prediction; crimson only where the steps diverge ("weicht ab").
 *
 * Floor point (x, y) of the surface function sits at three.js (x, height, y).
 */
import {
	BufferAttribute,
	BufferGeometry,
	FrontSide,
	Mesh,
	PlaneGeometry,
	SphereGeometry,
	Vector3,
	type Raycaster
} from 'three';
import { FigureBase } from './figure-base.js';
import { BallIntegrator } from './physics.js';
import { FIGURE_FPS } from './poses.js';
import { createRisoSurfaceMaterial, setRisoColour } from './riso-shader.js';
import {
	VALLEY_KAPPA_Y,
	diverges,
	valley,
	valleyMarks,
	type Point,
	type SurfaceFn,
	type ValleySceneParams
} from './surface.js';

export const VALLEY_GRID = 21;
export const VALLEY_HEIGHT_SCALE = 0.42;
const FLOOR = -0.14;
const BALL = 0.1;
const MARK = 0.045;
const LIFT = 0.012;

export interface ValleyReading {
	x: number;
	y: number;
	z: number;
	speed: number;
	/** Gradient marks reached so far (the start counts as 1). */
	marks: number;
	resting: boolean;
	diverges: boolean;
}

export interface ValleySceneOptions {
	canvas: HTMLCanvasElement;
	params: ValleySceneParams;
	onlost?: () => void;
	/** A tap on the surface: the learner sets a prediction there. */
	onpredict?: (point: Point) => void;
	/** The simulated state, at most 12 times per second (readouts tick, §4.1). */
	onreading?: (reading: ValleyReading) => void;
}

export interface ValleyScene {
	set(params: ValleySceneParams): void;
	/** Starts the roll from the start mark again. */
	roll(): void;
	setPrediction(point: Point | null): void;
	/** While an answer is open the figure stands still (§9.3c). */
	setFrozen(frozen: boolean): void;
	turn(direction: number): void;
	setActive(active: boolean): void;
	dispose(): void;
}

function lifted(fn: SurfaceFn, point: Point, scale: number, lift = LIFT): Vector3 {
	const e = fn.extent;
	const x = Math.min(Math.max(point.x, -e), e);
	const y = Math.min(Math.max(point.y, -e), e);
	return new Vector3(x, fn.height(x, y) * scale + lift, y);
}

function wireSegments(fn: SurfaceFn, scale: number): number[] {
	const n = VALLEY_GRID;
	const e = fn.extent;
	const at = (i: number) => -e + (2 * e * i) / (n - 1);
	const points: number[] = [];
	const push = (x: number, y: number) => points.push(x, fn.height(x, y) * scale, y);
	for (let j = 0; j < n; j++) {
		for (let i = 0; i < n - 1; i++) {
			push(at(i), at(j));
			push(at(i + 1), at(j));
			push(at(j), at(i));
			push(at(j), at(i + 1));
		}
	}
	return points;
}

function contourSegments(kappa: number, kappaY: number, extent: number): number[] {
	const points: number[] = [];
	const levels = [0.15, 0.4, 0.8, 1.35, 2];
	const steps = 72;
	for (const level of levels) {
		const rx = Math.sqrt(level / kappa);
		const ry = Math.sqrt(level / kappaY);
		for (let k = 0; k < steps; k++) {
			const a0 = (2 * Math.PI * k) / steps;
			const a1 = (2 * Math.PI * (k + 1)) / steps;
			const p0 = [rx * Math.cos(a0), ry * Math.sin(a0)];
			const p1 = [rx * Math.cos(a1), ry * Math.sin(a1)];
			const inside = (p: number[]) => Math.abs(p[0]) <= extent && Math.abs(p[1]) <= extent;
			if (inside(p0) && inside(p1)) points.push(p0[0], FLOOR, p0[1], p1[0], FLOOR, p1[1]);
		}
	}
	const e = extent;
	const corners = [
		[-e, -e],
		[e, -e],
		[e, e],
		[-e, e]
	];
	corners.forEach((corner, index) => {
		const next = corners[(index + 1) % 4];
		points.push(corner[0], FLOOR, corner[1], next[0], FLOOR, next[1]);
	});
	return points;
}

function surfaceGeometry(fn: SurfaceFn, scale: number): BufferGeometry {
	const n = VALLEY_GRID;
	const plane = new PlaneGeometry(2 * fn.extent, 2 * fn.extent, n - 1, n - 1);
	plane.rotateX(-Math.PI / 2);
	const position = plane.getAttribute('position') as BufferAttribute;
	for (let index = 0; index < position.count; index++) {
		const x = position.getX(index);
		const y = position.getZ(index);
		position.setY(index, fn.height(x, y) * scale);
	}
	plane.computeVertexNormals();
	return plane;
}

/** A square of side 2·size facing the camera is built per frame from the camera axes. */
function squareSegments(center: Vector3, size: number, right: Vector3, up: Vector3): number[] {
	const corners = [
		[-1, -1],
		[1, -1],
		[1, 1],
		[-1, 1]
	].map(([a, b]) =>
		center
			.clone()
			.addScaledVector(right, a * size)
			.addScaledVector(up, b * size)
	);
	const points: number[] = [];
	corners.forEach((corner, index) => {
		const next = corners[(index + 1) % 4];
		points.push(corner.x, corner.y, corner.z, next.x, next.y, next.z);
	});
	return points;
}

export function createValleyScene(options: ValleySceneOptions): ValleyScene {
	let params = options.params;
	let fn = valley(params);
	const scale = params.heightScale ?? VALLEY_HEIGHT_SCALE;
	const center = new Vector3(0, params.free ? 0.55 : 0.38, 0);
	const curvatureY = () => params.kappaY ?? VALLEY_KAPPA_Y;
	let marks = valleyMarks(params);
	let divergent = diverges(params.eta, params.kappa, curvatureY());
	let integrator = new BallIntegrator(fn, params.start, {}, params.free ? [] : marks);
	let rollStart = -1;
	let frozen = false;
	let prediction: Point | null = null;
	let lastReading = -1;

	const base = new FigureBase({
		canvas: options.canvas,
		figure: 'valley',
		radius: params.free ? 2.18 : 1.65,
		center,
		ground: 'paper',
		onlost: options.onlost,
		ontap: (ray) => pick(ray),
		animate: (now) => animate(now)
	});

	const surfaceMaterial = base.track(createRisoSurfaceMaterial('paper'));
	// Only the inside of the valley is filled: the outer side of the near wall stays open, so
	// the wire cage never hides the ball.
	surfaceMaterial.side = FrontSide;
	surfaceMaterial.polygonOffset = true;
	surfaceMaterial.polygonOffsetFactor = 1;
	surfaceMaterial.polygonOffsetUnits = 1;
	const surface = new Mesh(surfaceGeometry(fn, scale), surfaceMaterial);
	const wire = base.segments(wireSegments(fn, scale));
	const contours = base.segments(contourSegments(params.kappa, curvatureY(), fn.extent));

	const ballMaterial = base.track(createRisoSurfaceMaterial('orange'));
	const ball = new Mesh(new SphereGeometry(BALL, 32, 16), ballMaterial);
	const outline = base.segments([0, 0, 0, 0, 0, 0]);
	const plumb = base.segments([0, 0, 0, 0, 0, 0]);
	const trail = base.segments([0, 0, 0, 0, 0, 0]);
	const markBoxes = base.segments([0, 0, 0, 0, 0, 0]);
	const strayBoxes = base.segments([0, 0, 0, 0, 0, 0], 'crimson');
	const predictionMaterial = base.track(createRisoSurfaceMaterial('yellow', { raster: false }));
	const predictionPlate = new Mesh(new PlaneGeometry(1, 1), predictionMaterial);
	const predictionBox = base.segments([0, 0, 0, 0, 0, 0]);
	predictionPlate.visible = false;
	predictionBox.visible = false;
	base.add(surface, wire, contours, ball, outline, plumb, trail, markBoxes, strayBoxes);
	base.add(predictionPlate, predictionBox);

	function rebuild() {
		fn = valley(params);
		marks = valleyMarks(params);
		divergent = diverges(params.eta, params.kappa, curvatureY());
		surface.geometry.dispose();
		surface.geometry = surfaceGeometry(fn, scale);
		base.setSegments(wire, wireSegments(fn, scale));
		base.setSegments(contours, contourSegments(params.kappa, curvatureY(), fn.extent));
		restart();
	}

	function restart() {
		integrator = new BallIntegrator(fn, params.start, {}, params.free ? [] : marks);
		rollStart = -1;
		lastReading = -1;
		base.invalidate();
	}

	function pick(ray: Raycaster) {
		const hit = ray.intersectObject(surface, false)[0];
		if (!hit || !options.onpredict) return;
		options.onpredict({ x: hit.point.x, y: hit.point.z });
	}

	function cameraAxes(): { right: Vector3; up: Vector3 } {
		const right = new Vector3().setFromMatrixColumn(base.camera.matrixWorld, 0);
		const up = new Vector3().setFromMatrixColumn(base.camera.matrixWorld, 1);
		return { right, up };
	}

	function place() {
		const state = integrator.current;
		const z = fn.height(state.x, state.y) * scale + BALL;
		ball.position.set(state.x, z, state.y);
		const { right, up } = cameraAxes();
		// The ink outline is a 48-gon facing the camera: 1 px, whatever the zoom.
		const ring: number[] = [];
		const steps = 48;
		for (let k = 0; k < steps; k++) {
			const a0 = (2 * Math.PI * k) / steps;
			const a1 = (2 * Math.PI * (k + 1)) / steps;
			const p0 = ball.position
				.clone()
				.addScaledVector(right, Math.cos(a0) * BALL)
				.addScaledVector(up, Math.sin(a0) * BALL);
			const p1 = ball.position
				.clone()
				.addScaledVector(right, Math.cos(a1) * BALL)
				.addScaledVector(up, Math.sin(a1) * BALL);
			ring.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
		}
		base.setSegments(outline, ring);
		base.setSegments(plumb, [state.x, z, state.y, state.x, FLOOR, state.y]);

		// Marks reached so far: squares joined by straight lines (the step trail).
		const reached = Math.max(1, integrator.marksReached);
		// The marks are the exact gradient steps (§9.3b), the same sequence as the data table: all
		// at once in the lab, where the ball rolls freely, one by one in a worked solution.
		const shown = marks.slice(0, params.free ? marks.length : reached);
		const line: number[] = [];
		const boxes: number[] = [];
		const strays: number[] = [];
		shown.forEach((mark, index) => {
			const point = lifted(fn, mark, scale);
			const outside = Math.abs(mark.x) > fn.extent || Math.abs(mark.y) > fn.extent;
			(outside ? strays : boxes).push(...squareSegments(point, MARK, right, up));
			if (index > 0) {
				const previous = lifted(fn, shown[index - 1], scale);
				line.push(previous.x, previous.y, previous.z, point.x, point.y, point.z);
			}
		});
		base.setSegments(trail, line.length ? line : [0, 0, 0, 0, 0, 0]);
		trail.visible = line.length > 0;
		base.setSegments(markBoxes, boxes.length ? boxes : [0, 0, 0, 0, 0, 0]);
		markBoxes.visible = boxes.length > 0;
		base.setSegments(strayBoxes, strays.length ? strays : [0, 0, 0, 0, 0, 0]);
		strayBoxes.visible = divergent && strays.length > 0;
		setRisoColour(ballMaterial, 'orange');

		if (prediction) {
			const point = lifted(fn, prediction, scale, LIFT * 2);
			predictionPlate.position.copy(point);
			predictionPlate.quaternion.copy(base.camera.quaternion);
			predictionPlate.scale.setScalar(MARK * 3);
			base.setSegments(predictionBox, squareSegments(point, MARK * 1.5, right, up));
		}
		predictionPlate.visible = !!prediction;
		predictionBox.visible = !!prediction;

		// The raster stands only while nothing turns (§9.3: "im Stand").
		surfaceMaterial.uniforms.uRaster.value = base.orbit.moving ? 0 : 1;
	}

	function emit(now: number) {
		if (!options.onreading) return;
		const tick = Math.floor((now / 1000) * FIGURE_FPS);
		const resting = integrator.resting;
		if (tick === lastReading && !resting) return;
		lastReading = tick;
		const { x, y, vx, vy } = integrator.current;
		options.onreading({
			x,
			y,
			z: fn.height(x, y),
			speed: Math.hypot(vx, vy),
			marks: integrator.marksReached,
			resting,
			diverges: divergent
		});
	}

	function animate(now: number): boolean | 'idle' {
		let rolling: boolean | 'idle' = false;
		if (!frozen) {
			if (rollStart < 0) rollStart = now;
			integrator.advanceTo(Math.min((now - rollStart) / 1000, 60));
			const { vx, vy } = integrator.current;
			// The last slow drift into the bottom runs as the calm 12-fps idle.
			if (!integrator.resting && now - rollStart < 60_000)
				rolling = Math.hypot(vx, vy) < 0.06 ? 'idle' : true;
		}
		place();
		emit(now);
		return rolling;
	}

	base.invalidate();

	return {
		set(next: ValleySceneParams) {
			params = next;
			rebuild();
		},
		roll() {
			restart();
		},
		setPrediction(point: Point | null) {
			prediction = point;
			base.invalidate();
		},
		setFrozen(next: boolean) {
			frozen = next;
			if (!frozen) restart();
			base.invalidate();
		},
		turn(direction: number) {
			base.turn(direction);
		},
		setActive(active: boolean) {
			base.setActive(active);
		},
		dispose() {
			base.dispose();
		}
	};
}
