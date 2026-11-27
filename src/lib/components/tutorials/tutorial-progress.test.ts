import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import type { TutorialProgress } from './tutorial-progress.js';

const hooks = registerHooks({
	resolve(specifier, context, nextResolve) {
		const target = specifier === './tutorial-progress.js' ? './tutorial-progress.ts' : specifier;
		return nextResolve(target, context);
	}
});
const { progressFor, rememberProgress } = await import('./tutorial-progress.js');
hooks.deregister();

test('returning to a tutorial restores its moment and all visited steps', () => {
	const places = new Map<string, TutorialProgress>();
	rememberProgress(places, 'attention', 3, 1);
	rememberProgress(places, 'attention', 7, 2);
	assert.deepEqual(progressFor(places, 'backprop'), { index: 0, reached: [0] });

	rememberProgress(places, 'backprop', 3, 1);
	assert.deepEqual(progressFor(places, 'attention'), { index: 7, reached: [0, 1, 2] });

	rememberProgress(places, 'attention', 3, 1);
	assert.deepEqual(progressFor(places, 'attention'), { index: 3, reached: [0, 1, 2] });
	assert.deepEqual(progressFor(places, 'backprop'), { index: 3, reached: [0, 1] });
});
