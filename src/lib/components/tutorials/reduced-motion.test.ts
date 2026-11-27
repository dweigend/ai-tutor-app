import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// `npx vitest` and `node --test` both run this file: take the runner that is there.
const runner: string = process.env.VITEST ? 'vitest' : 'node:test';
const { test }: Pick<typeof import('node:test'), 'test'> = await import(runner);

const hooks = registerHooks({
	resolve(specifier, context, nextResolve) {
		const target = specifier === './reduced-motion.js' ? './reduced-motion.ts' : specifier;
		return nextResolve(target, context);
	}
});
const { watchReducedMotion } = await import('./reduced-motion.js');
hooks.deregister();

test('the lab receives live motion changes and unsubscribes on cleanup', () => {
	const media = Object.assign(new EventTarget(), { matches: false });
	const changes: boolean[] = [];
	const cleanup = watchReducedMotion(media, (reduced) => changes.push(reduced));
	assert.deepEqual(changes, [false]);

	media.matches = true;
	media.dispatchEvent(new Event('change'));
	media.matches = false;
	media.dispatchEvent(new Event('change'));
	assert.deepEqual(changes, [false, true, false]);

	cleanup();
	media.matches = true;
	media.dispatchEvent(new Event('change'));
	assert.deepEqual(changes, [false, true, false]);
});
