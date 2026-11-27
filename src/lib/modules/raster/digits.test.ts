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

const { keyExists, keyFromKeyboard, normalizeDigits, pressDigit } = await import('./digits.js');

const price = { decimals: 3, signed: true };
const whole = { decimals: 0, signed: false };
const type = (keys: string[], options = price) =>
	keys.reduce((value, key) => pressDigit(value, key as never, options), '');

test('typing builds the string the check rules expect', () => {
	assert.equal(type(['0', ',', '4', '7', '6']), '0,476');
	assert.equal(type([',', '4']), '0,4');
	assert.equal(type(['1', ',', '9', '2']), '1,92');
	assert.equal(type(['8'], whole), '8');
});

test('decimals and leading zeros are limited', () => {
	assert.equal(type(['0', ',', '4', '7', '6', '1']), '0,476');
	assert.equal(type(['0', '5']), '5');
	assert.equal(type(['1', ',', ',', '2']), '1,2');
	assert.equal(type(['1', ',', '5'], whole), '15');
});

test('the sign toggles, the back key deletes', () => {
	assert.equal(type(['2', '4', '±']), '-24');
	assert.equal(type(['2', '4', '±', '±']), '24');
	assert.equal(type(['2', '4', 'back']), '2');
	assert.equal(type(['±', '5'], whole), '5');
});

test('keys that cannot apply do not exist on the pad', () => {
	assert.equal(keyExists(',', whole), false);
	assert.equal(keyExists('±', whole), false);
	assert.equal(keyExists('7', whole), true);
});

test('hardware keys and pasted text follow the same rules', () => {
	assert.equal(keyFromKeyboard('.'), ',');
	assert.equal(keyFromKeyboard('-'), '±');
	assert.equal(keyFromKeyboard('Backspace'), 'back');
	assert.equal(keyFromKeyboard('a'), null);
	assert.equal(normalizeDigits(' 0.476 € ', price), '0,476');
	assert.equal(normalizeDigits('-24', price), '-24');
	assert.equal(normalizeDigits('1,2,3', price), '1,23');
});
