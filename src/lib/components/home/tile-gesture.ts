import type { Attachment } from 'svelte/attachments';

const TOUCH_HOLD_MS = 200;
const SLOP_PX = 8;
const AXIS_RATIO = 1.2;
const VELOCITY_WINDOW_MS = 80;
/**
 * A click that follows a swipe or a lift comes right after the release (touch browsers add up to
 * ~300 ms). Later clicks are new taps and must reach their link.
 */
export const CLICK_GUARD_MS = 400;

/**
 * Swallows the one click that belongs to a finished swipe or lift, nothing else (council R1):
 * a cancelled gesture fires no click, so it leaves no guard behind; a guard that saw no click
 * within CLICK_GUARD_MS expires.
 */
export interface ClickGuard {
	/** The gesture became a swipe or a lift: its click must not open the tile. */
	arm(): void;
	/** The gesture ended at `time` (event timeStamp); `cancelled` means pointercancel. */
	settle(time: number, cancelled: boolean): void;
	/** A new gesture starts: whatever the last one left is void. */
	clear(): void;
	/** True once, for the click that follows a released swipe or lift. */
	swallow(time: number): boolean;
}

export function createClickGuard(windowMs = CLICK_GUARD_MS): ClickGuard {
	let armed = false;
	let until = -Infinity;
	return {
		arm() {
			armed = true;
			until = Infinity;
		},
		settle(time, cancelled) {
			if (!armed) return;
			if (cancelled) {
				armed = false;
				until = -Infinity;
				return;
			}
			until = time + windowMs;
		},
		clear() {
			armed = false;
			until = -Infinity;
		},
		swallow(time) {
			if (!armed) return false;
			armed = false;
			const hit = time <= until;
			until = -Infinity;
			return hit;
		}
	};
}

export interface Point {
	x: number;
	y: number;
}

interface Sample extends Point {
	time: number;
}

interface Target {
	id: string;
	anchor: HTMLElement;
}

interface Gesture {
	target: Target;
	pointerId: number;
	start: Sample;
	samples: Sample[];
	grabbed: boolean;
}

interface TileGestureHandlers {
	targetFor: (event: PointerEvent) => Target | undefined;
	onInput: () => void;
	onGrab: (id: string, start: Point) => void;
	onMove: (id: string, pointer: Point, velocity: Point) => void;
	onDrop: (id: string, pointer: Point, velocity: Point) => void;
	onCancel: (id: string) => void;
}

function sample(event: PointerEvent): Sample {
	return { x: event.clientX, y: event.clientY, time: event.timeStamp };
}

function velocityOf(gesture: Gesture, last: Sample): Point {
	const first = gesture.samples.find((sample) => last.time - sample.time <= VELOCITY_WINDOW_MS);
	if (!first || first.time >= last.time) return { x: 0, y: 0 };
	const seconds = (last.time - first.time) / 1000;
	return { x: (last.x - first.x) / seconds, y: (last.y - first.y) / seconds };
}

/** Delegate once from the grid. A captured anchor stays in place until the gesture ends. */
export function tileGesture(handlers: TileGestureHandlers): Attachment<HTMLElement> {
	return (grid) => {
		const listeners = new AbortController();
		const options = { signal: listeners.signal };
		const clickGuard = createClickGuard();
		let gesture: Gesture | undefined;
		let hold: ReturnType<typeof setTimeout> | undefined;

		function reset() {
			clearTimeout(hold);
			const active = gesture;
			gesture = undefined;
			if (active?.target.anchor.hasPointerCapture(active.pointerId)) {
				active.target.anchor.releasePointerCapture(active.pointerId);
			}
		}

		function grab(active: Gesture) {
			active.grabbed = true;
			clickGuard.arm();
			handlers.onGrab(active.target.id, active.start);
		}

		grid.addEventListener('focusin', handlers.onInput, options);

		grid.addEventListener(
			'pointerdown',
			(event) => {
				handlers.onInput();
				if (gesture || !event.isPrimary || event.button !== 0) return;
				clickGuard.clear();
				const target = handlers.targetFor(event);
				if (!target) return;
				const start = sample(event);
				const active: Gesture = {
					target,
					start,
					pointerId: event.pointerId,
					samples: [start],
					grabbed: false
				};
				gesture = active;
				target.anchor.setPointerCapture(event.pointerId);
				if (event.pointerType === 'touch') {
					hold = setTimeout(() => grab(active), TOUCH_HOLD_MS);
				}
			},
			options
		);

		grid.addEventListener(
			'pointermove',
			(event) => {
				const active = gesture;
				if (!active || event.pointerId !== active.pointerId) return;
				const current = sample(event);
				const dx = current.x - active.start.x;
				const dy = current.y - active.start.y;
				if (!active.grabbed) {
					if (Math.hypot(dx, dy) < SLOP_PX) return;
					clearTimeout(hold);
					// A vertical touch before the hold is native scrolling.
					if (event.pointerType === 'touch' && Math.abs(dx) < Math.abs(dy) * AXIS_RATIO) {
						reset();
						return;
					}
					grab(active);
				}
				const velocity = velocityOf(active, current);
				active.samples = active.samples.filter(
					({ time }) => current.time - time <= VELOCITY_WINDOW_MS
				);
				active.samples.push(current);
				handlers.onMove(active.target.id, current, velocity);
			},
			options
		);

		function end(event: PointerEvent, cancelled: boolean) {
			const active = gesture;
			if (!active || event.pointerId !== active.pointerId) return;
			reset();
			clickGuard.settle(event.timeStamp, cancelled);
			if (!active.grabbed) return;
			if (cancelled) {
				handlers.onCancel(active.target.id);
				return;
			}
			const released = sample(event);
			handlers.onDrop(active.target.id, released, velocityOf(active, released));
		}

		grid.addEventListener('pointerup', (event) => end(event, false), options);
		grid.addEventListener('pointercancel', (event) => end(event, true), options);
		grid.addEventListener('lostpointercapture', (event) => end(event, true), options);
		grid.addEventListener(
			'click',
			(event) => {
				// Keyboard and assistive technology activate links with a non-pointer click.
				if (event.detail === 0 || !clickGuard.swallow(event.timeStamp)) return;
				event.preventDefault();
				event.stopPropagation();
			},
			{ ...options, capture: true }
		);
		grid.addEventListener(
			'touchmove',
			(event) => {
				if (gesture?.grabbed && event.cancelable) event.preventDefault();
			},
			{ ...options, passive: false }
		);
		grid.addEventListener(
			'contextmenu',
			(event) => {
				if (gesture) event.preventDefault();
			},
			options
		);

		return () => {
			listeners.abort();
			reset();
		};
	};
}
