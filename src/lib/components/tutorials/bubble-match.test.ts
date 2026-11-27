import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import katex from 'katex';

// `npx vitest` and `node --test` both run this file: take the runner that is there.
const runner: string = process.env.VITEST ? 'vitest' : 'node:test';
const { describe, it }: Pick<typeof import('node:test'), 'describe' | 'it'> = await import(runner);
const lib = new URL('../../', import.meta.url).href;
// Bundler imports use .js specifiers. Node resolves them to the TypeScript sources.
const hooks = process.env.VITEST
	? null
	: registerHooks({
			resolve(specifier, context, nextResolve) {
				const own = context.parentURL?.startsWith(lib) && /^\.\.?\/.*\.js$/.test(specifier);
				return nextResolve(own ? specifier.replace(/\.js$/, '.ts') : specifier, context);
			}
		});
const { DROP_SLOP, EMPTY_MATCH, judgeDrop, slotAt } = await import('./bubble-match.js');
const { deckKatexOptions } = await import('./deck-formula.js');
const { attentionBubbles, attentionDeckLatex, attentionSlotOrder, attentionTerms, deckTermIds } =
	await import('../../math/attention-terms.js');
const { explainDecks } = await import('../../content/tutorials.js');
hooks?.deregister();

type Term = (typeof attentionBubbles)[number]['term'];
const terms = attentionBubbles.map((bubble) => bubble.term);

describe('dropping a bubble on a slot', () => {
	it('a right pair sits, a wrong pair counts a miss and changes nothing else', () => {
		const miss = judgeDrop<Term>(EMPTY_MATCH, 'Q', 'K', 5);
		assert.deepEqual(miss, {
			state: { matched: [], misses: 1 },
			outcome: 'missed',
			solved: false
		});
		const hit = judgeDrop(miss.state, 'Q', 'Q', 5);
		assert.deepEqual(hit, {
			state: { matched: ['Q'], misses: 1 },
			outcome: 'matched',
			solved: false
		});
		// The earlier state is left as it was.
		assert.deepEqual(miss.state, { matched: [], misses: 1 });
	});

	it('a solved bubble or slot ignores a further drop', () => {
		const state = { matched: ['Q'] as Term[], misses: 0 };
		assert.deepEqual(judgeDrop(state, 'Q', 'K', 5), { state, outcome: 'ignored', solved: false });
		assert.deepEqual(judgeDrop(state, 'K', 'Q', 5), { state, outcome: 'ignored', solved: false });
	});

	it('is solved when every bubble sits, in any order', () => {
		let state = EMPTY_MATCH as { matched: readonly Term[]; misses: number };
		let solved = false;
		for (const term of [...terms].reverse()) {
			assert.equal(solved, false);
			({ state, solved } = judgeDrop(state, term, term, terms.length));
		}
		assert.equal(solved, true);
		assert.deepEqual([...state.matched].sort(), [...terms].sort());
		assert.equal(state.misses, 0);
	});
});

describe('the slot under the pointer', () => {
	const boxes = [
		{ id: 'top', left: 100, top: 0, right: 300, bottom: 56 },
		{ id: 'bottom', left: 100, top: 64, right: 300, bottom: 120 }
	];

	it('finds the slot, with some reach around its edge', () => {
		assert.equal(slotAt(200, 30, boxes), 'top');
		assert.equal(slotAt(100 - DROP_SLOP, 90, boxes), 'bottom');
		assert.equal(slotAt(100 - DROP_SLOP - 1, 90, boxes), null);
		assert.equal(slotAt(200, 200, boxes), null);
		assert.equal(slotAt(200, 30, []), null);
	});

	it('between two slots the nearer centre wins', () => {
		assert.equal(slotAt(200, 58, boxes), 'top');
		assert.equal(slotAt(200, 62, boxes), 'bottom');
	});
});

describe('bubbles of the attention formula', () => {
	it('five bubbles, each with a meaning and a hint that passes no verdict', () => {
		assert.deepEqual(terms, ['Q', 'K', 'V', 'dk', 'softmax']);
		assert.equal(new Set(attentionBubbles.map((bubble) => bubble.meaning)).size, 5);
		for (const bubble of attentionBubbles) {
			assert.ok(bubble.spoken.length > 0 && bubble.hint.length > 0);
			assert.doesNotMatch(bubble.hint, /!|[Ff]alsch|Fast|Richtig/);
			assert.ok(deckTermIds[bubble.term] in attentionTerms);
		}
	});

	it('the slots hold every term once and no bubble faces its own meaning', () => {
		assert.deepEqual([...attentionSlotOrder].sort(), [...terms].sort());
		terms.forEach((term, row) => assert.notEqual(attentionSlotOrder[row], term));
	});

	it('every deck formula renders and marks only known terms', () => {
		const attention = katex.renderToString(attentionDeckLatex, deckKatexOptions);
		for (const term of terms) assert.ok(attention.includes(`data-term="${term}"`), term);
		const known = new Set<string>([...terms, 'a', 'b', 'c', 'mul', 'add', 'loss']);
		for (const deck of explainDecks) {
			for (const { formula } of deck.slides) {
				if (!formula) continue;
				const html = katex.renderToString(formula.latex, deckKatexOptions);
				assert.match(html, /<math[ >]/);
				assert.ok(formula.spoken.length > 0);
				for (const [, term] of html.matchAll(/data-term="([^"]+)"/g)) assert.ok(known.has(term));
			}
		}
	});

	it('trusts nothing but the term mark', () => {
		const options = { ...deckKatexOptions, throwOnError: false };
		assert.doesNotMatch(
			katex.renderToString(String.raw`\href{https://example.org}{x}`, options),
			/<a /
		);
		assert.doesNotMatch(katex.renderToString(String.raw`\htmlId{x}{y}`, options), /id="x"/);
		assert.doesNotMatch(
			katex.renderToString(String.raw`\htmlData{evil=1}{y}`, options),
			/data-evil/
		);
	});
});
