import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

/*
 * Static checks of the v3 contract (DESIGN.md §3 and §6.2) over every stylesheet and component:
 * two shapes only, and the code font on visible code only.
 */
const SRC = new URL('../../', import.meta.url);
const SOURCES = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
	.filter((file) => /\.(css|svelte)$/.test(file))
	.map((file) => ({ file, text: readFileSync(new URL(file, SRC), 'utf8') }));

/** Square, circle, pill, answer pill. `var(--radius)` is the v2 bridge name of square. */
const RADII = new Set([
	'0',
	'50%',
	'inherit',
	'var(--radius-flat)',
	'var(--radius-pill)',
	'var(--radius-option)',
	'var(--radius)'
]);

/** The selector of the rule that holds position `at`. */
function selectorAt(text: string, at: number): string {
	const open = text.lastIndexOf('{', at);
	const before = Math.max(
		text.lastIndexOf('}', open),
		text.lastIndexOf(';', open),
		text.lastIndexOf('*/', open) + 1
	);
	return text.slice(before + 1, open).trim();
}

test('every stylesheet and component is scanned', () => {
	assert.ok(SOURCES.length > 50, `found only ${SOURCES.length} files`);
});

test('border-radius is square, circle, pill or answer pill (no radius of 4–24px)', () => {
	const strays: string[] = [];
	for (const { file, text } of SOURCES) {
		for (const [, value] of text.matchAll(/border-radius:\s*([^;]+);/g)) {
			if (!RADII.has(value.trim())) strays.push(`${file}: ${value.trim()}`);
		}
	}
	assert.deepEqual(strays, []);
});

test('the code font is read by [data-code] rules only', () => {
	const strays: string[] = [];
	for (const { file, text } of SOURCES) {
		for (const match of text.matchAll(/var\(--font-code\)/g)) {
			const selector = selectorAt(text, match.index);
			if (!selector.includes('[data-code')) strays.push(`${file}: ${selector}`);
		}
	}
	assert.deepEqual(strays, []);
});

test('JetBrains Mono is named in fonts.css and tokens.css only', () => {
	const named = SOURCES.filter(({ text }) => text.includes("'JetBrains Mono'")).map(
		({ file }) => file
	);
	assert.deepEqual(named.sort(), ['lib/styles/fonts.css', 'lib/styles/tokens.css']);
});

test('no icon font is left: no private-use code point in any stylesheet or component', () => {
	const privateUse = /[\u{E000}-\u{F8FF}\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/u;
	const strays = SOURCES.filter(({ text }) => privateUse.test(text)).map(({ file }) => file);
	assert.deepEqual(strays, []);
});
