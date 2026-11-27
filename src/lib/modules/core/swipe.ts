import type { Attachment } from 'svelte/attachments';

/**
 * Swiping as a behaviour (ui/DESIGN.md §11 D1, §11.5, §12 Nr. 8): sideways at once means away,
 * vertical means scroll. The element keeps `touch-action: pan-y`, so the browser scrolls on its
 * own and only hands us horizontal drags.
 */
export type SwipeAction = 'later' | 'dismiss';

/** A drag must travel this far before it picks an axis, so taps and scroll starts stay taps. */
const SLOP_PX = 10;
/** Horizontal wins only when it clearly leads; diagonal starts stay with the page scroll. */
const AXIS_RATIO = 1.2;
/** Share of the row width at which a release commits. */
export const COMMIT_SHARE = 0.4;
/** A flick commits early: faster than this (px/s) and past FLICK_SHARE of the width. */
const FLICK_SPEED = 700;
const FLICK_SHARE = 0.15;
/** Window for the release speed; older samples describe a different movement. */
const VELOCITY_WINDOW_MS = 80;

/** Right means later (yellow), left means away (crimson). */
export function directionOf(offset: number): SwipeAction | null {
	if (offset > 0) return 'later';
	if (offset < 0) return 'dismiss';
	return null;
}

/** True once a release at this offset would commit; the row shows it as a hard switch. */
export function isArmed(offset: number, width: number): boolean {
	return width > 0 && Math.abs(offset) >= width * COMMIT_SHARE;
}

/** The action a release triggers, or null to spring back. */
export function releaseAction(offset: number, velocity: number, width: number): SwipeAction | null {
	if (isArmed(offset, width)) return directionOf(offset);
	const flick = Math.abs(velocity) >= FLICK_SPEED && Math.sign(velocity) === Math.sign(offset);
	if (flick && Math.abs(offset) >= width * FLICK_SHARE) return directionOf(offset);
	return null;
}

export interface SwipeHandlers {
	/** Called while the finger drags sideways, with the offset in px. */
	onMove: (offset: number) => void;
	/** Finger lifted after a sideways drag; velocity in px/s. */
	onRelease: (offset: number, velocity: number) => void;
	/** The browser took the gesture over (scroll, system gesture). */
	onCancel: () => void;
}

interface Sample {
	x: number;
	time: number;
}

type Phase = 'idle' | 'pending' | 'horizontal';

function releaseVelocity(samples: Sample[]): number {
	const last = samples.at(-1);
	const first = samples.find((sample) => last && last.time - sample.time <= VELOCITY_WINDOW_MS);
	if (!last || !first || last.time === first.time) return 0;
	return ((last.x - first.x) / (last.time - first.time)) * 1000;
}

/**
 * Svelte attachment: `<div {@attach swipe(handlers)}>`. Tracks one pointer, locks the axis after
 * SLOP_PX and swallows the click that ends a sideways drag. All listeners go on removal.
 */
export function swipe(handlers: SwipeHandlers): Attachment<HTMLElement> {
	return (element) => {
		let phase: Phase = 'idle';
		let pointerId = -1;
		let startX = 0;
		let startY = 0;
		let samples: Sample[] = [];
		let dragged = false;

		const down = (event: PointerEvent) => {
			if (phase !== 'idle' || !event.isPrimary || event.button !== 0) return;
			phase = 'pending';
			pointerId = event.pointerId;
			startX = event.clientX;
			startY = event.clientY;
			samples = [{ x: 0, time: event.timeStamp }];
			dragged = false;
		};

		const move = (event: PointerEvent) => {
			if (event.pointerId !== pointerId || phase === 'idle') return;
			const dx = event.clientX - startX;
			const dy = event.clientY - startY;
			if (phase === 'pending') {
				if (Math.hypot(dx, dy) < SLOP_PX) return;
				if (Math.abs(dx) < Math.abs(dy) * AXIS_RATIO) {
					phase = 'idle';
					return;
				}
				phase = 'horizontal';
				dragged = true;
				element.setPointerCapture(event.pointerId);
			}
			samples.push({ x: dx, time: event.timeStamp });
			samples = samples.filter((sample) => event.timeStamp - sample.time <= VELOCITY_WINDOW_MS);
			handlers.onMove(dx);
		};

		const up = (event: PointerEvent) => {
			if (event.pointerId !== pointerId) return;
			const wasHorizontal = phase === 'horizontal';
			phase = 'idle';
			pointerId = -1;
			if (!wasHorizontal) return;
			handlers.onRelease(event.clientX - startX, releaseVelocity(samples));
		};

		const cancel = (event: PointerEvent) => {
			if (event.pointerId !== pointerId) return;
			const wasHorizontal = phase === 'horizontal';
			phase = 'idle';
			pointerId = -1;
			if (wasHorizontal) handlers.onCancel();
		};

		// A link or button inside the row must not fire after a sideways drag.
		const click = (event: MouseEvent) => {
			if (!dragged) return;
			dragged = false;
			event.preventDefault();
			event.stopPropagation();
		};

		element.addEventListener('pointerdown', down);
		element.addEventListener('pointermove', move);
		element.addEventListener('pointerup', up);
		element.addEventListener('pointercancel', cancel);
		element.addEventListener('click', click, { capture: true });
		return () => {
			element.removeEventListener('pointerdown', down);
			element.removeEventListener('pointermove', move);
			element.removeEventListener('pointerup', up);
			element.removeEventListener('pointercancel', cancel);
			element.removeEventListener('click', click, { capture: true });
		};
	};
}
