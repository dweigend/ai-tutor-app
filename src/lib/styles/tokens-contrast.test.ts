import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import type { Surface } from '../modules/surface-shell/surfaces.js';

// Bundler imports use .js specifiers. Resolve them to test the original TypeScript in Node.
registerHooks({
	resolve(specifier, context, nextResolve) {
		if (/^\.\.?\//.test(specifier) && specifier.endsWith('.js')) {
			return nextResolve(specifier.replace(/\.js$/, '.ts'), context);
		}
		return nextResolve(specifier, context);
	}
});

const { SURFACE_COLORS } = await import('../modules/surface-shell/surfaces.js');

/*
 * DESIGN.md §5.1: every role pair of tokens.css is measured on all six surfaces. The test reads
 * the stylesheet itself, so a changed hex value or a new surface block cannot slip past it.
 */
const TOKENS = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
const SURFACES = Object.keys(SURFACE_COLORS) as Surface[];

/** WCAG 2.2 AA: normal text. */
const TEXT_MIN = 4.5;
/** WCAG 2.2 SC 1.4.11: parts of a control that must be seen (ring, joint, handle). */
const PART_MIN = 3;

/** Every role a surface block must set, so no part falls back to another surface's value. */
const ROLES = [
	'surface',
	'text',
	'text-muted',
	'hairline',
	'card',
	'well',
	'mark',
	'mark-text',
	'mark-border',
	'grip',
	'grip-text',
	'grip-border',
	'deviation',
	'deviation-text',
	'action',
	'action-text',
	'focus',
	'focus-halo'
] as const;
type Role = (typeof ROLES)[number];

/** Text on its ground: [foreground, background]. */
const TEXT_PAIRS: readonly (readonly [Role, Role])[] = [
	['text', 'surface'],
	['text-muted', 'surface'],
	['text', 'card'],
	['text-muted', 'card'],
	['text', 'well'],
	['text-muted', 'well'],
	['mark-text', 'mark'],
	['grip-text', 'grip'],
	['deviation-text', 'deviation'],
	['action-text', 'action']
];

/** Parts that carry a state or a boundary against the surface. */
const PART_PAIRS: readonly (readonly [Role, Role])[] = [
	['hairline', 'surface'],
	['focus', 'surface'],
	['grip', 'surface'],
	['deviation', 'surface'],
	['action', 'surface']
];

function declarations(block: string): Map<string, string> {
	const found = new Map<string, string>();
	for (const [, name, value] of block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
		found.set(name, value.trim());
	}
	return found;
}

/** The body of the first rule whose selector list contains `selector`. */
function ruleBody(selector: string): string {
	const start = TOKENS.indexOf(selector);
	assert.notEqual(start, -1, `tokens.css has no rule for ${selector}`);
	const open = TOKENS.indexOf('{', start);
	return TOKENS.slice(open + 1, TOKENS.indexOf('}', open));
}

function expandHex(hex: string): string {
	const digits = hex.slice(1).toLowerCase();
	const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits;
	assert.match(full, /^[0-9a-f]{6}$/, `not a hex colour: ${hex}`);
	return `#${full}`;
}

const palette = new Map(
	[...declarations(ruleBody(':root {'))]
		.filter(([name]) => name.startsWith('palette-'))
		.map(([name, value]) => [name, expandHex(value)])
);

function surfaceRoles(surface: Surface): Map<string, string> {
	const roles = new Map<string, string>();
	for (const [name, value] of declarations(ruleBody(`[data-surface='${surface}']`))) {
		const reference = /^var\(--(palette-[a-z-]+)\)$/.exec(value);
		assert.ok(reference, `${surface} --${name}: roles read the palette only, got ${value}`);
		const hex = palette.get(reference[1]);
		assert.ok(hex, `${surface} --${name}: unknown palette colour ${reference[1]}`);
		roles.set(name, hex);
	}
	return roles;
}

function luminance(hex: string): number {
	const [red, green, blue] = [1, 3, 5].map((at) => {
		const channel = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
		return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(first: string, second: string): number {
	const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
	return (light + 0.05) / (dark + 0.05);
}

test('the palette is the eight v2 colours plus stone and graphite', () => {
	assert.deepEqual([...palette.keys()].sort(), [
		'palette-graphite',
		'palette-ink',
		'palette-ink-muted',
		'palette-muted-on-dark',
		'palette-paper',
		'palette-signal-crimson',
		'palette-signal-orange',
		'palette-signal-yellow',
		'palette-stone',
		'palette-white'
	]);
	assert.equal(palette.get('palette-stone'), '#e8e4da');
	assert.equal(palette.get('palette-graphite'), '#262522');
});

test('the WCAG formula reproduces the ratios quoted in the contract', () => {
	assert.equal(contrast('#e8e4da', '#0a0a0a').toFixed(2), '15.59');
	assert.equal(contrast('#262522', '#ffffff').toFixed(2), '15.33');
	assert.equal(contrast('#f4b810', '#0a0a0a').toFixed(2), '11.04');
	assert.equal(contrast('#e8e4da', '#4a4945').toFixed(2), '7.10');
});

for (const surface of SURFACES) {
	const roles = surfaceRoles(surface);
	const hex = (role: Role): string => {
		const value = roles.get(role);
		assert.ok(value, `${surface} sets no --${role}`);
		return value;
	};

	test(`${surface}: sets exactly the role set and matches theme-color`, () => {
		assert.deepEqual([...roles.keys()].sort(), [...ROLES].sort());
		assert.equal(hex('surface'), SURFACE_COLORS[surface]);
	});

	for (const [foreground, background] of TEXT_PAIRS) {
		test(`${surface}: --${foreground} on --${background} >= ${TEXT_MIN}:1`, () => {
			const ratio = contrast(hex(foreground), hex(background));
			assert.ok(
				ratio >= TEXT_MIN,
				`${hex(foreground)} on ${hex(background)} is ${ratio.toFixed(2)}`
			);
		});
	}

	for (const [part, ground] of PART_PAIRS) {
		test(`${surface}: --${part} against --${ground} >= ${PART_MIN}:1`, () => {
			const ratio = contrast(hex(part), hex(ground));
			assert.ok(ratio >= PART_MIN, `${hex(part)} on ${hex(ground)} is ${ratio.toFixed(2)}`);
		});
	}

	// "Never colour alone": the sign on a mark is a circle in --mark-text with the check in --mark.
	test(`${surface}: the check on its sign circle >= ${TEXT_MIN}:1`, () => {
		const ratio = contrast(hex('mark'), hex('mark-text'));
		assert.ok(ratio >= TEXT_MIN, `check is ${ratio.toFixed(2)}`);
	});
}
