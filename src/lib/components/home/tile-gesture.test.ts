import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

// Bundler imports use .js specifiers. Resolve them to test the original TypeScript in Node.
registerHooks({
	resolve(specifier, context, nextResolve) {
		if (/^\.\.?\//.test(specifier) && specifier.endsWith('.js')) {
			return nextResolve(specifier.replace(/\.js$/, '.ts'), context);
		}
		return nextResolve(specifier, context);
	}
});

const { CLICK_GUARD_MS, createClickGuard } = await import('./tile-gesture.js');

test('the click right after a released swipe or lift is swallowed, once', () => {
	const guard = createClickGuard();
	guard.arm();
	guard.settle(1000, false);
	assert.equal(guard.swallow(1010), true);
	// The next tap is a new click and reaches its link.
	assert.equal(guard.swallow(1020), false);
});

test('a cancelled gesture leaves no guard behind', () => {
	const guard = createClickGuard();
	guard.arm();
	guard.settle(1000, true);
	assert.equal(guard.swallow(1005), false);
});

test('a guard without its click expires', () => {
	const guard = createClickGuard();
	guard.arm();
	guard.settle(1000, false);
	assert.equal(guard.swallow(1000 + CLICK_GUARD_MS + 1), false);
	assert.equal(guard.swallow(1000 + CLICK_GUARD_MS + 2), false);
});

test('a plain tap and a new gesture are never swallowed', () => {
	const guard = createClickGuard();
	guard.settle(1000, false);
	assert.equal(guard.swallow(1001), false);
	guard.arm();
	guard.clear();
	assert.equal(guard.swallow(1002), false);
});

const { tileGesture } = await import('./tile-gesture.js');

function gestureFixture() {
	const grid = new EventTarget();
	const anchor = {
		setPointerCapture() {},
		hasPointerCapture: () => false
	} as unknown as HTMLElement;
	const calls = { drops: [] as { x: number; y: number }[], cancellations: 0 };
	const cleanup = tileGesture({
		targetFor: () => ({ id: 'offer', anchor }),
		onInput() {},
		onGrab() {},
		onMove() {},
		onDrop: (_, __, velocity) => calls.drops.push(velocity),
		onCancel: () => calls.cancellations++
	})(grid as HTMLElement);

	function pointer(type: string, timeStamp: number, clientX: number, clientY = 30) {
		const event = new Event(type, { cancelable: true });
		Object.defineProperty(event, 'timeStamp', { value: timeStamp });
		Object.assign(event, {
			pointerId: 1,
			pointerType: 'mouse',
			isPrimary: true,
			button: 0,
			clientX,
			clientY
		});
		grid.dispatchEvent(event);
	}
	return { calls, pointer, cleanup };
}

test('pointercancel after grabbing cancels once without dropping', () => {
	const { calls, pointer, cleanup } = gestureFixture();
	pointer('pointerdown', 0, 30);
	pointer('pointermove', 25, 90);
	pointer('pointercancel', 30, 90);
	pointer('lostpointercapture', 31, 90);
	assert.deepEqual(calls, { drops: [], cancellations: 1 });
	cleanup?.();
});

test('release speed uses pointerup even after the hand stops moving', () => {
	const { calls, pointer, cleanup } = gestureFixture();
	pointer('pointerdown', 0, 30);
	pointer('pointermove', 20, 90);
	pointer('pointermove', 38, 140);
	pointer('pointerup', 180, 140);
	pointer('pointerdown', 250, 30);
	pointer('pointermove', 270, 90);
	pointer('pointerup', 290, 130);
	assert.deepEqual(calls.drops, [
		{ x: 0, y: 0 },
		{ x: 2500, y: 0 }
	]);
	cleanup?.();
});

const { blockOffset, wushAction } = await import('./block-physics.js');
const bounds = { left: 0, right: 390 };
const start = { x: 195, y: 100 };
const stationary = { x: 0, y: 0 };

test('the edge resists, then a release or outward fling can eject an offer', () => {
	assert.equal(blockOffset(start, { x: 250, y: 130 }, bounds, false).x, 55);
	const edge = { x: 382, y: 100 };
	assert.ok(blockOffset(start, edge, bounds, false).x < edge.x - start.x);
	assert.equal(wushAction(start, edge, stationary, bounds, false), 'later');
	assert.equal(wushAction(start, { x: 50, y: 100 }, stationary, bounds, false), undefined);
	assert.equal(wushAction(start, { x: 50, y: 100 }, { x: -700, y: 0 }, bounds, false), 'dismiss');
	assert.equal(wushAction(start, { x: 5, y: 300 }, stationary, bounds, false), undefined);
});

test('fixed tiles stretch less than the pointer and cannot be thrown', () => {
	const pointer = { x: 410, y: 200 };
	const offset = blockOffset(start, pointer, bounds, true);
	assert.ok(offset.x > 0 && offset.x < 45);
	assert.ok(offset.y > 0 && offset.y < 45);
	assert.equal(wushAction(start, pointer, { x: 1000, y: 0 }, bounds, true), undefined);
});
