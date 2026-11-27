import type { SwipeOutcome } from './board.js';
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

/**
 * A block that falls into its place (issue #58). It accelerates like a dropped building block,
 * hits the ground and rebounds once: 20 % of the impact speed, so at most 4 % of the drop
 * height (DESIGN.md §4.4). A rebound slower than `restSpeed` is not worth showing.
 * Units: px, px/s, px/s².
 */
export const FALL = { gravity: 9000, restitution: 0.2, restSpeed: 200 } as const;

/** How far the blocks under a landing block give way before they spring back, in px. */
export const IMPACT_PX = 4;

/** Fixed integration step, so a fall does not depend on the frame rate (60 or 120 Hz). */
const FALL_STEP_SECONDS = 1 / 240;

export interface FallState {
	/** Position relative to the resting place; negative is above it. */
	offset: number;
	velocity: number;
	/** How often the block has hit the ground. */
	impacts: number;
	resting: boolean;
}

export function fallFrom(height: number): FallState {
	const above = Math.max(0, height);
	return { offset: 0 - above, velocity: 0, impacts: 0, resting: above === 0 };
}

/** Advances a falling block by `seconds`. Pure. */
export function stepFall(state: FallState, seconds: number): FallState {
	let { offset, velocity, impacts, resting } = state;
	let remaining = seconds;
	while (remaining > 0 && !resting) {
		const dt = Math.min(FALL_STEP_SECONDS, remaining);
		velocity += FALL.gravity * dt;
		offset += velocity * dt;
		remaining -= dt;
		if (offset < 0) continue;
		impacts += 1;
		offset = 0;
		velocity *= -FALL.restitution;
		if (-velocity < FALL.restSpeed) {
			velocity = 0;
			resting = true;
		}
	}
	return { offset, velocity, impacts, resting };
}
