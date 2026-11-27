import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

// Bundler imports use .js specifiers and $lib aliases. Resolve them to the TypeScript sources.
registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === '$lib/figures') {
			return nextResolve(new URL('../../figures/poses.ts', import.meta.url).href, context);
		}
		if (specifier.startsWith('.') && specifier.endsWith('.js')) {
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
