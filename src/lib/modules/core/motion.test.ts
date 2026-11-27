import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

// Bundler imports use .js specifiers. Resolve them to test the original TypeScript in Node.
registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier.startsWith('./') && specifier.endsWith('.js')) {
			return nextResolve(specifier.replace(/\.js$/, '.ts'), context);
		}
		return nextResolve(specifier, context);
	}
});

const { SPRINGS, animate, carryVelocity, springSamples, stepSpring } = await import('./motion.js');

type Spring = (typeof SPRINGS)[keyof typeof SPRINGS];

const FRAME = 1 / 120;

/** Runs a spring for `seconds` in 120 Hz frames; returns the path of positions. */
function run(spring: Spring, from: number, to: number, velocity: number, seconds: number) {
	let state = { position: from, velocity };
	const path = [from];
	for (let t = 0; t < seconds; t += FRAME) {
		state = stepSpring(state, to, spring, FRAME);
		path.push(state.position);
	}
	return path;
}

/** Largest travel past the target, as a share of the distance. */
function overshoot(path: number[], from: number, to: number): number {
	const direction = Math.sign(to - from);
	const beyond = Math.max(0, ...path.map((position) => (position - to) * direction));
	return beyond / Math.abs(to - from);
}

test('snap never overshoots and converges within 300 ms', () => {
	const path = run(SPRINGS.snap, 0, 100, 0, 1);
	const share = overshoot(path, 0, 100);
	const at300 = path[Math.round(0.3 / FRAME)];
	console.log(
		`snap: overshoot ${(share * 100).toFixed(3)} %, rest at 300 ms ${(100 - at300).toFixed(3)} %`
	);
	assert.equal(share, 0);
	assert.ok(Math.abs(100 - at300) <= 1.5, `remaining at 300 ms: ${100 - at300}`);
});

test('carry keeps a typical swipe speed and overshoots at most 4 %', () => {
	// A release 120 px from the target at 1800 px/s, and the strongest speed carry keeps.
	const cases = [
		{ from: 0, to: 120, velocity: 1800 },
		{ from: 60, to: 0, velocity: -900 },
		{ from: 0, to: 390, velocity: carryVelocity(0, 390, 99_999) },
		{ from: 0, to: 100, velocity: 0 }
	];
	for (const { from, to, velocity } of cases) {
		const kept = carryVelocity(from, to, velocity);
		const share = overshoot(run(SPRINGS.carry, from, to, kept, 2), from, to);
		console.log(
			`carry: ${from}→${to} at ${velocity} px/s keeps ${kept.toFixed(0)}, overshoot ${(share * 100).toFixed(2)} %`
		);
		assert.ok(share > 0, 'carry overshoots once');
		assert.ok(share <= 0.04, `overshoot ${share}`);
	}
	assert.equal(carryVelocity(0, 120, 1800), 1080, 'speed above 9 distances per second is capped');
});

test('reduced motion and tick reach the exact target in one step', () => {
	for (const options of [
		{ preset: 'carry' as const, reducedMotion: true },
		{ preset: 'tick' as const, reducedMotion: false }
	]) {
		const updates: number[] = [];
		let rested = 0;
		let requested = 0;
		const frames = {
			request: () => ++requested,
			cancel: () => {}
		};
		animate(
			{
				from: 0,
				to: 237,
				velocity: 500,
				...options,
				onUpdate: (position) => updates.push(position),
				onRest: () => rested++
			},
			frames
		);
		assert.deepEqual(updates, [237]);
		assert.equal(rested, 1);
		assert.equal(requested, 0, 'no frame requested');
	}
});

test('animate stops without leaving a frame behind', () => {
	const pending = new Map<number, (time: number) => void>();
	let next = 0;
	const frames = {
		request: (callback: (time: number) => void) => {
			pending.set(++next, callback);
			return next;
		},
		cancel: (handle: number) => pending.delete(handle)
	};
	const updates: number[] = [];
	const animation = animate(
		{ from: 0, to: 100, preset: 'snap', reducedMotion: false, onUpdate: (p) => updates.push(p) },
		frames
	);
	for (let time = 0; time < 50; time += 16) {
		const [handle, callback] = [...pending][0];
		pending.delete(handle);
		callback(time);
	}
	animation.stop();
	assert.equal(pending.size, 0);
	assert.ok(updates.length > 1);
});

test('springSamples runs from 0 to exactly 1 without overshoot for snap', () => {
	const samples = springSamples('snap');
	assert.equal(samples[0], 0);
	assert.equal(samples.at(-1), 1);
	assert.ok(samples.every((value) => value <= 1));
});
