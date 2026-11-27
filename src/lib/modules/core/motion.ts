/**
 * The one spring of the device (ui/DESIGN.md §4.2–§4.4, §4.8). Plain TypeScript on
 * requestAnimationFrame, no GSAP. Objects follow the finger and spring; readouts tick.
 * Units are free (px, progress, degrees); time is in seconds.
 */
export interface Spring {
	stiffness: number;
	damping: number;
	mass: number;
}

/**
 * Start values from DESIGN.md §4.3, to tune on the device.
 * snap: slightly above critical damping (2·√520 ≈ 45.6), never overshoots, rests after about 250 ms.
 * carry: damping ratio 0.74, overshoots once by about 3 % and keeps the finger's speed.
 */
export const SPRINGS = {
	snap: { stiffness: 520, damping: 46, mass: 1 },
	carry: { stiffness: 260, damping: 24, mass: 1 }
} as const satisfies Record<string, Spring>;

/** `tick` has no spring: readouts change at once (DESIGN.md §4.1). */
export type MotionPreset = keyof typeof SPRINGS | 'tick';

export interface SpringState {
	position: number;
	velocity: number;
}

/** Fixed integration step, so a path does not depend on the frame rate (60 or 120 Hz). */
const STEP_SECONDS = 1 / 240;
/** Longest frame gap we integrate; after a hidden tab the spring resumes instead of jumping. */
const MAX_FRAME_SECONDS = 1 / 20;
/**
 * carry keeps the finger's speed only up to 9 travel distances per second. Up to that ratio the
 * single overshoot stays at or below 3.8 % (simulated; motion.test.ts checks the 4 % bound).
 */
const MAX_CARRY_SPEED_PER_DISTANCE = 9;
/** Rest thresholds in the caller's unit: half a pixel and half a pixel per frame at 60 Hz. */
const DEFAULT_REST_DELTA = 0.5;
const DEFAULT_REST_SPEED = 30;

/** Advances a spring by `seconds` with semi-implicit Euler in fixed sub-steps. Pure. */
export function stepSpring(
	state: SpringState,
	target: number,
	spring: Spring,
	seconds: number
): SpringState {
	let { position, velocity } = state;
	let remaining = seconds;
	while (remaining > 0) {
		const dt = Math.min(STEP_SECONDS, remaining);
		const force = -spring.stiffness * (position - target) - spring.damping * velocity;
		velocity += (force / spring.mass) * dt;
		position += velocity * dt;
		remaining -= dt;
	}
	return { position, velocity };
}

/** The finger speed carry keeps, limited so a throw overshoots at most once by ≤ 4 %. */
export function carryVelocity(from: number, to: number, velocity: number): number {
	const limit = Math.abs(to - from) * MAX_CARRY_SPEED_PER_DISTANCE;
	return Math.max(-limit, Math.min(limit, velocity));
}

export function isAtRest(
	state: SpringState,
	target: number,
	restDelta = DEFAULT_REST_DELTA,
	restSpeed = DEFAULT_REST_SPEED
): boolean {
	return Math.abs(state.position - target) <= restDelta && Math.abs(state.velocity) <= restSpeed;
}

export function prefersReducedMotion(): boolean {
	if (typeof window === 'undefined' || !window.matchMedia) return false;
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface FrameScheduler {
	request(callback: (timeMs: number) => void): number;
	cancel(handle: number): void;
}

function browserFrames(): FrameScheduler {
	return {
		request: (callback) => requestAnimationFrame(callback),
		cancel: (handle) => cancelAnimationFrame(handle)
	};
}

export interface AnimateOptions {
	from: number;
	to: number;
	preset: MotionPreset;
	/** Start speed in units per second, e.g. the finger speed on release (used by carry). */
	velocity?: number;
	/** Defaults to the user's `prefers-reduced-motion` setting. */
	reducedMotion?: boolean;
	restDelta?: number;
	onUpdate: (position: number) => void;
	onRest?: () => void;
}

export interface Animation {
	stop(): void;
}

/**
 * Runs a spring from `from` to `to`. `tick` and reduced motion jump to the end state at once,
 * without a frame. `stop()` cancels the pending frame, so nothing leaks after unmount.
 */
export function animate(
	options: AnimateOptions,
	frames: FrameScheduler = browserFrames()
): Animation {
	const reduced = options.reducedMotion ?? prefersReducedMotion();
	if (reduced || options.preset === 'tick') {
		options.onUpdate(options.to);
		options.onRest?.();
		return { stop() {} };
	}
	const spring = SPRINGS[options.preset];
	const startVelocity = options.velocity ?? 0;
	const velocity =
		options.preset === 'carry' ? carryVelocity(options.from, options.to, startVelocity) : 0;
	let state: SpringState = { position: options.from, velocity };
	let handle = 0;
	let last: number | undefined;

	const frame = (timeMs: number) => {
		const seconds = last === undefined ? 0 : Math.min((timeMs - last) / 1000, MAX_FRAME_SECONDS);
		last = timeMs;
		state = stepSpring(state, options.to, spring, seconds);
		if (isAtRest(state, options.to, options.restDelta)) {
			handle = 0;
			options.onUpdate(options.to);
			options.onRest?.();
			return;
		}
		options.onUpdate(state.position);
		handle = frames.request(frame);
	};
	handle = frames.request(frame);
	return {
		stop() {
			if (handle !== 0) frames.cancel(handle);
			handle = 0;
		}
	};
}

/**
 * Samples a spring from 0 to 1 at a fixed frame rate until it rests. Used to drive animations
 * the browser runs itself (the surface wipe between routes) with the same spring.
 */
export function springSamples(preset: keyof typeof SPRINGS, frameMs = 1000 / 60): number[] {
	const spring = SPRINGS[preset];
	const samples = [0];
	let state: SpringState = { position: 0, velocity: 0 };
	const restDelta = 1 / 1000;
	while (!isAtRest(state, 1, restDelta, restDelta * 60)) {
		state = stepSpring(state, 1, spring, frameMs / 1000);
		samples.push(state.position);
	}
	samples[samples.length - 1] = 1;
	return samples;
}
