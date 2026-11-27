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

const { ICONS, ICON_NAMES } = await import('./icons.js');

/** The eleven signs of issue #33; every other icon extends this set. */
const BASE = [
	'arrow-right',
	'arrow-left',
	'close',
	'check',
	'grid',
	'volume',
	'play',
	'pause',
	'plus',
	'minus',
	'external'
];

test('the base set is complete', () => {
	for (const name of BASE) assert.ok(ICON_NAMES.includes(name as never), `missing icon ${name}`);
});

test('every icon is path data inside the 24 grid', () => {
	for (const name of ICON_NAMES) {
		const paths = ICONS[name];
		assert.ok(paths.length > 0, `${name} is empty`);
		for (const d of paths) {
			assert.match(d, /^M[0-9MmLlHhVvCcSsAaZz .,-]+$/, `${name}: ${d}`);
			const [x, y] = d
				.slice(1)
				.split(/[ ,]|(?=-)|(?=[a-zA-Z])/)
				.map(Number);
			assert.ok(x >= 0 && x <= 24 && y >= 0 && y <= 24, `${name} starts outside the grid: ${d}`);
		}
	}
});

test('no sparkle stands in for the tutor or for AI', () => {
	for (const name of ICON_NAMES) assert.doesNotMatch(name, /sparkle|magic|ai\b/);
});
