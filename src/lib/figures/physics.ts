/**
 * Own fixed-timestep integrator for the ball in the valley (ui/DESIGN.md §9.3, §14.4: no Rapier).
 * Plain TypeScript: no three, no Svelte, no clock. The caller says which time it is; the
 * integrator runs exactly floor(t · HZ) steps of 1/HZ seconds. So 30, 60 or 120 frames per
 * second give the very same path (physics.test.ts).
 *
 * Forces on the floor plane: the slope −∇f (gravity along the surface), inertia, linear rolling
 * friction and a small dry friction that lets the ball come to rest. Optional guide marks: the
 * ball is pulled towards the current mark with a spring, rolls past it with its momentum and
 * swings back (Schwung und Nachlauf). After the last mark it rolls freely into the valley.
 */
import type { Point, SurfaceFn } from './surface.js';

export const PHYSICS_HZ = 120;
export const PHYSICS_DT = 1 / PHYSICS_HZ;

export interface BallState {
	x: number;
	y: number;
	vx: number;
	vy: number;
}

export interface TracePoint extends BallState {
	/** Integrator tick of the sample; time = tick / PHYSICS_HZ. */
	tick: number;
	z: number;
}

export interface PhysicsParams {
	/** Pull along the slope. */
	gravity: number;
	/** Linear rolling friction (1/s). */
	friction: number;
	/** Dry friction (acceleration) that stops a slow ball on a flat floor. */
	dryFriction: number;
	/** Spring towards the current guide mark (1/s²); 0 without marks. */
	guide: number;
	/** Ticks the ball spends on its way to each guide mark. */
	ticksPerMark: number;
	/** A trace sample every n ticks (the recorded step trail). */
	recordEvery: number;
}

export const DEFAULT_PHYSICS: PhysicsParams = {
	gravity: 6,
	friction: 1.1,
	dryFriction: 0.15,
	guide: 26,
	ticksPerMark: 54,
	recordEvery: 6
};

const EPS = 1e-9;

export class BallIntegrator {
	readonly params: PhysicsParams;
	readonly trace: TracePoint[] = [];
	private readonly fn: SurfaceFn;
	/** Guide marks, the first one is the start. Without marks the ball rolls freely. */
	private readonly marks: readonly Point[];
	private state: BallState;
	private ticks = 0;

	constructor(
		fn: SurfaceFn,
		start: Point,
		params: Partial<PhysicsParams> = {},
		marks: readonly Point[] = []
	) {
		this.fn = fn;
		this.marks = marks;
		this.params = { ...DEFAULT_PHYSICS, ...params };
		this.state = { x: start.x, y: start.y, vx: 0, vy: 0 };
		this.record();
	}

	get tick(): number {
		return this.ticks;
	}

	get current(): Readonly<BallState> {
		return this.state;
	}

	/** Index of the mark the ball is heading for, or −1 once it rolls freely. */
	get markIndex(): number {
		if (this.marks.length < 2) return -1;
		const index = Math.floor(this.ticks / this.params.ticksPerMark) + 1;
		return index < this.marks.length ? index : -1;
	}

	/** Number of marks the ball has reached so far (the start counts). */
	get marksReached(): number {
		if (this.marks.length === 0) return 0;
		const index = this.markIndex;
		return index === -1 ? this.marks.length : index;
	}

	/** True when the ball lies still and no mark pulls any more. */
	get resting(): boolean {
		const { vx, vy } = this.state;
		return (
			this.markIndex === -1 &&
			Math.hypot(vx, vy) < 1e-4 &&
			this.slopeAccel() < this.params.dryFriction
		);
	}

	/** Runs all whole steps up to `seconds` since the start. Never runs backwards. */
	advanceTo(seconds: number): number {
		const target = Math.floor(seconds * PHYSICS_HZ + EPS);
		let ran = 0;
		while (this.ticks < target) {
			this.step();
			ran++;
		}
		return ran;
	}

	/** One fixed step: semi-implicit Euler. */
	step() {
		const { gravity, friction, dryFriction, guide } = this.params;
		const s = this.state;
		const [gx, gy] = this.fn.gradient(s.x, s.y);
		// On a surface z = f(x, y) the pull along the floor shrinks with the steepness.
		const slope = gravity / (1 + gx * gx + gy * gy);
		let ax = -slope * gx - friction * s.vx;
		let ay = -slope * gy - friction * s.vy;
		const index = this.markIndex;
		if (index !== -1) {
			const mark = this.clamp(this.marks[index]);
			ax += guide * (mark.x - s.x);
			ay += guide * (mark.y - s.y);
		}
		let vx = s.vx + ax * PHYSICS_DT;
		let vy = s.vy + ay * PHYSICS_DT;
		// Dry friction takes speed off; it never reverses the motion.
		const speed = Math.hypot(vx, vy);
		const brake = dryFriction * PHYSICS_DT;
		if (speed <= brake) {
			vx = 0;
			vy = 0;
		} else if (speed > 0) {
			vx -= (vx / speed) * brake;
			vy -= (vy / speed) * brake;
		}
		let x = s.x + vx * PHYSICS_DT;
		let y = s.y + vy * PHYSICS_DT;
		// The rim of the shown square is a wall: the ball stops there instead of leaving the figure.
		const e = this.fn.extent;
		if (x < -e || x > e) {
			x = Math.min(Math.max(x, -e), e);
			vx = 0;
		}
		if (y < -e || y > e) {
			y = Math.min(Math.max(y, -e), e);
			vy = 0;
		}
		this.state = { x, y, vx, vy };
		this.ticks++;
		if (this.ticks % this.params.recordEvery === 0) this.record();
	}

	private slopeAccel(): number {
		const [gx, gy] = this.fn.gradient(this.state.x, this.state.y);
		return (this.params.gravity / (1 + gx * gx + gy * gy)) * Math.hypot(gx, gy);
	}

	private clamp(point: Point): Point {
		const e = this.fn.extent;
		return { x: Math.min(Math.max(point.x, -e), e), y: Math.min(Math.max(point.y, -e), e) };
	}

	private record() {
		const { x, y } = this.state;
		this.trace.push({ ...this.state, tick: this.ticks, z: this.fn.height(x, y) });
	}
}

/**
 * Runs a whole simulation frame by frame at `hz` frames per second for `seconds` and returns
 * the position after every frame. Used by the tests and by the 2D sheet (complete trail).
 */
export function simulate(
	fn: SurfaceFn,
	start: Point,
	options: { hz: number; seconds: number; params?: Partial<PhysicsParams>; marks?: Point[] }
): { frames: { t: number; x: number; y: number }[]; integrator: BallIntegrator } {
	const integrator = new BallIntegrator(fn, start, options.params, options.marks);
	const frames: { t: number; x: number; y: number }[] = [];
	const count = Math.round(options.seconds * options.hz);
	for (let frame = 1; frame <= count; frame++) {
		const t = frame / options.hz;
		integrator.advanceTo(t);
		frames.push({ t, x: integrator.current.x, y: integrator.current.y });
	}
	return { frames, integrator };
}
