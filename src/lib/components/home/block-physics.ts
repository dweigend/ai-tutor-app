import type { SwipeOutcome } from './arrangement.js';
import type { Point } from './tile-gesture.js';

interface HorizontalBounds {
	left: number;
	right: number;
}

export const MAX_TILT_DEG = 2;
const EDGE_RESISTANCE_PX = 68;
const EDGE_RELEASE_PX = 26;
const FLICK_SPEED_PX_S = 650;
const MIN_THROW_TRAVEL_PX = 18;
const FIXED_TRAVEL_PX = 45;

function elastic(distance: number, limit: number): number {
	return distance / (1 + Math.abs(distance) / limit);
}

/** Preserve movement on approach, then ease further travel into the edge. */
export function blockOffset(
	start: Point,
	pointer: Point,
	bounds: HorizontalBounds,
	fixed: boolean
): Point {
	const x = pointer.x - start.x;
	const y = pointer.y - start.y;
	if (fixed) return { x: elastic(x, FIXED_TRAVEL_PX), y: elastic(y, FIXED_TRAVEL_PX) };
	if (x === 0) return { x, y };
	const edge = x < 0 ? bounds.left : bounds.right;
	const freeTravel = Math.max(0, Math.abs(edge - start.x) - EDGE_RESISTANCE_PX);
	const excess = Math.max(0, Math.abs(x) - freeTravel);
	return { x: x - Math.sign(x) * (excess - elastic(excess, EDGE_RESISTANCE_PX)), y };
}

/** A side must be reached on purpose, or approached with an outward fling. */
export function wushAction(
	start: Point,
	pointer: Point,
	velocity: Point,
	bounds: HorizontalBounds,
	fixed: boolean
): SwipeOutcome | undefined {
	const dx = pointer.x - start.x;
	if (fixed || Math.abs(dx) < MIN_THROW_TRAVEL_PX || Math.abs(dx) < Math.abs(pointer.y - start.y))
		return;
	const left = dx < 0;
	const distance = left ? pointer.x - bounds.left : bounds.right - pointer.x;
	const outwardSpeed = left ? -velocity.x : velocity.x;
	if (
		distance <= EDGE_RELEASE_PX ||
		(distance < EDGE_RESISTANCE_PX && outwardSpeed >= FLICK_SPEED_PX_S)
	) {
		return left ? 'dismiss' : 'later';
	}
}
