import { animate, prefersReducedMotion, type Animation, type MotionPreset } from '$lib/modules';
import { fallFrom, stepFall } from './block-physics';
import type { Point } from './tile-gesture';

/** Where a block is drawn relative to its slot: offset, tilt and difference in size, in px. */
export interface Pose extends Point {
	rotate: number;
	w: number;
	h: number;
}

export const REST: Pose = { x: 0, y: 0, rotate: 0, w: 0, h: 0 };

const AXES = ['x', 'y', 'rotate', 'w', 'h'] as const;

interface PoseMotion {
	from: Pose;
	to: Pose;
	preset: MotionPreset;
	velocity?: Point;
	onUpdate: (pose: Pose) => void;
	onRest: () => void;
}

/** Each axis uses the shared spring in pixels (or degrees for tilt). */
export function animatePose({
	from,
	to,
	preset,
	velocity,
	onUpdate,
	onRest
}: PoseMotion): Animation {
	const axes = AXES.filter((axis) => from[axis] !== to[axis]);
	if (axes.length === 0 || prefersReducedMotion() || preset === 'tick') {
		onUpdate(to);
		onRest();
		return { stop() {} };
	}
	const pose = { ...from };
	let remaining = axes.length;
	const springs = axes.map((axis) =>
		animate({
			from: from[axis],
			to: to[axis],
			preset,
			velocity: axis === 'x' || axis === 'y' ? velocity?.[axis] : 0,
			onUpdate: (position) => {
				pose[axis] = position;
				onUpdate({ ...pose });
			},
			onRest: () => {
				remaining -= 1;
				if (remaining === 0) onRest();
			}
		})
	);
	return { stop: () => springs.forEach((spring) => spring.stop()) };
}

/** Longest frame gap a fall integrates; after a hidden tab it resumes instead of jumping. */
const MAX_FRAME_SECONDS = 1 / 20;

interface FallMotion {
	/** Drop height in px above the resting place. */
	height: number;
	/** Seconds before the block lets go. */
	delay?: number;
	/** Vertical offset from the resting place; negative is above it. */
	onUpdate: (offset: number) => void;
	/** The first contact with the ground. */
	onImpact?: () => void;
	onRest: () => void;
}

/**
 * Lets a block fall into its place and rebound once (block-physics.ts). Reduced motion shows
 * the resting block at once.
 */
export function animateFall({
	height,
	delay = 0,
	onUpdate,
	onImpact,
	onRest
}: FallMotion): Animation {
	let state = fallFrom(height);
	if (state.resting || prefersReducedMotion()) {
		onUpdate(0);
		onRest();
		return { stop() {} };
	}
	let waiting = delay;
	let last: number | undefined;
	let handle = 0;
	const frame = (timeMs: number) => {
		const seconds = last === undefined ? 0 : Math.min((timeMs - last) / 1000, MAX_FRAME_SECONDS);
		last = timeMs;
		const falling = Math.max(0, seconds - waiting);
		waiting = Math.max(0, waiting - seconds);
		const landed = state.impacts > 0;
		state = stepFall(state, falling);
		if (!landed && state.impacts > 0) onImpact?.();
		onUpdate(state.offset);
		if (state.resting) {
			handle = 0;
			onRest();
			return;
		}
		handle = requestAnimationFrame(frame);
	};
	handle = requestAnimationFrame(frame);
	return {
		stop() {
			if (handle !== 0) cancelAnimationFrame(handle);
			handle = 0;
		}
	};
}
