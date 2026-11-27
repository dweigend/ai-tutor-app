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

const { parseRichText, plainRichText, speakRichText, splitGreek } = await import('./rich-text.js');

test('raised and lowered runs become tokens, never HTML', () => {
	assert.deepEqual(parseRichText('h = 10^{−6}, a = 2'), [
		{ kind: 'text', text: 'h = 10' },
		{ kind: 'sup', text: '−6' },
		{ kind: 'text', text: ', a = 2' }
	]);
	assert.deepEqual(parseRichText('w_{0} und d_{k}'), [
		{ kind: 'text', text: 'w' },
		{ kind: 'sub', text: '0' },
		{ kind: 'text', text: ' und d' },
		{ kind: 'sub', text: 'k' }
	]);
});

test('plain text without markup stays one token', () => {
	assert.deepEqual(parseRichText('f(w) = (w − 3)²'), [{ kind: 'text', text: 'f(w) = (w − 3)²' }]);
	assert.deepEqual(parseRichText(''), []);
});

test('broken notation stays visible as text', () => {
	for (const text of ['10^{−6', '10^{}', 'a^{b{c}}', 'x_ 0', '<sup>−6</sup>']) {
		const tokens = parseRichText(text);
		assert.deepEqual(tokens, [{ kind: 'text', text }]);
	}
});

test('plain text counts the visible characters for budgets', () => {
	assert.equal(
		plainRichText('Zentrale Differenz, h = 10^{−6}, a = 2, b = −3, frische Knoten').length,
		59
	);
});

test('spoken text reads the raised part and the minus sign', () => {
	assert.equal(speakRichText('h = 10^{−6}'), 'h = 10 hoch minus 6');
	assert.equal(speakRichText('4 · 3,5 · 3,25'), '4, 3,5, 3,25');
	assert.equal(speakRichText('L = d · d'), 'L = d mal d');
	assert.equal(speakRichText('Python · Liste [2, 3, 4]'), 'Python, Liste [2, 3, 4]');
	assert.equal(speakRichText('x · x'), 'x mal x');
});

test('no glyph outside the fonts is needed for the notation', () => {
	const tokens = parseRichText('10^{−6}');
	assert.ok(!tokens.some((token) => /[⁰-₟]/.test(token.text)));
});

test('Greek letters are split out for the Mono voice', () => {
	assert.deepEqual(splitGreek('Bei η = 0,105 ist'), [
		{ greek: false, text: 'Bei ' },
		{ greek: true, text: 'η' },
		{ greek: false, text: ' = 0,105 ist' }
	]);
	assert.deepEqual(splitGreek('ohne'), [{ greek: false, text: 'ohne' }]);
});
