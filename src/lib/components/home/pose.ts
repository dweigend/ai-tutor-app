import { animate, prefersReducedMotion, type Animation, type MotionPreset } from '$lib/modules';
import type { Point } from './tile-gesture';

export interface Pose extends Point {
	rotate: number;
}

export const REST: Pose = { x: 0, y: 0, rotate: 0 };

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
	const axes = (['x', 'y', 'rotate'] as const).filter((axis) => from[axis] !== to[axis]);
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
			velocity: axis === 'rotate' ? 0 : velocity?.[axis],
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
