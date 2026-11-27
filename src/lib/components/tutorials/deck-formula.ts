/**
 * KaTeX settings of the deck formulas. The decks mark their terms with `\htmlData{term=…}`, so
 * a dragged bubble can light up its place in the formula. Only that one command is trusted and
 * its only attribute is `term`; the LaTeX itself is fixed content, never user input.
 */
import type { KatexOptions } from 'katex';

export const deckKatexOptions: KatexOptions = {
	throwOnError: true,
	maxExpand: 100,
	maxSize: 10,
	strict: (code: string) => (code === 'htmlExtension' ? 'ignore' : 'warn'),
	trust: (context) =>
		context.command === '\\htmlData' &&
		Object.keys(context.attributes ?? {}).every((name) => name === 'data-term')
};
