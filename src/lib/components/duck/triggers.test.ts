import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

// Bundler imports use .js specifiers and $lib aliases. Resolve them to the TypeScript sources.
registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === '$lib/figures') {
			return nextResolve(new URL('../../figures/poses.ts', import.meta.url).href, context);
		}
		if (
			specifier.startsWith('.') &&
			specifier.endsWith('.js') &&
			context.parentURL?.includes('/src/lib/')
		) {
			return nextResolve(specifier.replace(/\.js$/, '.ts'), context);
		}
		return nextResolve(specifier, context);
	}
});

const { BOUNDARY_POSE, idleAllowed, isOneShot, poseForPhase, reactionFor } =
	await import('./triggers.js');
const { DUCK_POSES } = await import('../../figures/poses.js');

const MOVES = [
	'nachhaken',
	'paraphrasieren',
	'vorhersage_verlangen',
	'kontrastfall',
	'gestufter_hinweis',
	'kurz_erklaeren',
	'beispiel_zeigen',
	'zurueckerklaeren_lassen',
	'abruf_pruefen',
	'transfer_stellen',
	'interesse_erfragen',
	'routine_vorschlagen',
	'pause_anbieten',
	'abschliessen'
] as const;

test('the head shake comes only from the delegation boundary (DESIGN.md §9.2f)', () => {
	for (const move of MOVES) {
		assert.equal(reactionFor({ move, boundary: true }), BOUNDARY_POSE, move);
		assert.notEqual(reactionFor({ move, boundary: false }), BOUNDARY_POSE, move);
	}
	for (const phase of ['rest', 'listen', 'think', 'speak'] as const) {
		assert.notEqual(poseForPhase(phase), BOUNDARY_POSE);
	}
});

test('a deviation is never judged: contrast case and hints end in wait', () => {
	assert.equal(reactionFor({ move: 'kontrastfall', boundary: false }), 'wait');
	assert.equal(reactionFor({ move: 'gestufter_hinweis', boundary: false }), 'wait');
});

test('after a question the duck waits (DESIGN.md §9.2g)', () => {
	for (const move of ['nachhaken', 'vorhersage_verlangen', 'zurueckerklaeren_lassen'] as const) {
		assert.equal(reactionFor({ move, boundary: false }), 'wait');
	}
	assert.equal(poseForPhase('rest'), 'wait');
});

test('confirming nods once, closing celebrates once', () => {
	assert.equal(reactionFor({ move: 'paraphrasieren', boundary: false }), 'nod');
	assert.equal(reactionFor({ move: 'abschliessen', boundary: false }), 'celebrate');
	assert.ok(isOneShot('nod') && isOneShot('celebrate') && isOneShot(BOUNDARY_POSE));
	assert.ok(!isOneShot('wait') && !isOneShot('speak'));
});

test('idle gags only before the start and after closing', () => {
	assert.equal(idleAllowed(false, false), true);
	assert.equal(idleAllowed(true, false), false);
	assert.equal(idleAllowed(true, true), true);
});

test('legacy tutor triggers remain supported', () => {
	assert.equal(DUCK_POSES.length, 8);
	const mapped = new Set([
		...MOVES.map((move) => reactionFor({ move, boundary: false })),
		...(['rest', 'listen', 'think', 'speak'] as const).map(poseForPhase),
		BOUNDARY_POSE
	]);
	for (const pose of mapped) assert.ok(new Set<string>(DUCK_POSES).has(pose), pose);
});

test('v3 tickles and glances finish once while idle is safe', () => {
	assert.ok(isOneShot('giggle') && isOneShot('look_around'));
	assert.equal(isOneShot('idle'), false);
});

const { SWIPE_THRESHOLD, createTapBurst, pullDistance, rubberBand, swipeOutcome } =
	await import('./gesture.js');

test('Ziehen: kurzer Druck ist ein Tippen, nur genug Weg in Zielrichtung wechselt die Ansicht', () => {
	assert.equal(swipeOutcome(2, -3, 'up'), 'tap');
	assert.equal(swipeOutcome(0, -SWIPE_THRESHOLD, 'up'), 'commit');
	assert.equal(swipeOutcome(0, -(SWIPE_THRESHOLD - 1), 'up'), 'rebound');
	assert.equal(swipeOutcome(0, SWIPE_THRESHOLD * 2, 'up'), 'rebound');
	assert.equal(swipeOutcome(0, SWIPE_THRESHOLD, 'down'), 'commit');
	// A sideways drag turns the duck and never leaves the page.
	assert.equal(swipeOutcome(120, 80, 'down'), 'rebound');
});

test('Gummiband folgt dem Finger, bremst zunehmend und bleibt unter der Grenze', () => {
	assert.equal(rubberBand(0), 0);
	assert.equal(rubberBand(Number.NaN), 0);
	assert.ok(rubberBand(-40) < 0 && rubberBand(-40) > -40);
	assert.ok(rubberBand(10) > 7, 'kleine Wege laufen fast eins zu eins mit');
	assert.ok(rubberBand(10_000, 160) < 160);
	assert.ok(rubberBand(200) - rubberBand(100) < rubberBand(100) - rubberBand(0));
	assert.equal(pullDistance(30, 'up'), 0);
	assert.equal(pullDistance(-30, 'up'), -30);
	assert.equal(pullDistance(-30, 'down'), 0);
});

test('Easter Egg: drei schnelle Tipper schalten genau einmal, langsame nie', () => {
	const burst = createTapBurst(3, 900);
	assert.deepEqual(
		[0, 200, 400, 600].map((t) => burst.tap(t)),
		[false, false, true, false]
	);
	const slow = createTapBurst(3, 900);
	assert.deepEqual(
		[0, 600, 1200, 1800].map((t) => slow.tap(t)),
		[false, false, false, false]
	);
	assert.equal(slow.since(2000), 200);
	slow.reset();
	assert.equal(slow.since(2000), Infinity);
});

test('the ink line thins with the canvas, so the 72 px corner duck keeps open lenses', async () => {
	const { duckOutlineWidth, isMiniDuck } = await import('../../figures/duck-halftone-shader.js');
	assert.equal(duckOutlineWidth(1280, 900), 1.5);
	assert.equal(duckOutlineWidth(240, 240), 1.5);
	assert.ok(duckOutlineWidth(72, 72) < 0.5);
	assert.ok(duckOutlineWidth(72, 72) > 0);
	assert.equal(duckOutlineWidth(0, 0), 1.5);
	assert.equal(isMiniDuck(72, 72), true);
	assert.equal(isMiniDuck(390, 844), false);
});
