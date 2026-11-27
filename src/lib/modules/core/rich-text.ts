/**
 * Raised and lowered text without raw HTML (ui/DESIGN.md §6.9, Art-Director-Auflage #3).
 * Content writes a fixed notation, the renderer turns it into text, <sup> and <sub> nodes:
 *
 *   10^{−6}  →  10 + sup("−6")        w_{0}  →  w + sub("0")        d_{k}  →  d + sub("k")
 *
 * Only `^{…}` and `_{…}` are markup. A brace that does not close, a nested brace or an empty pair
 * stays plain text, so a typo shows up on screen instead of disappearing. Nothing here builds
 * HTML: RichText.svelte renders the tokens as elements, never as raw markup.
 */
export type RichToken =
	{ kind: 'text'; text: string } | { kind: 'sup'; text: string } | { kind: 'sub'; text: string };

const MARKUP = /([\^_])\{([^{}]+)\}/g;

/** Splits `text` into plain, raised and lowered runs. Adjacent plain runs are merged. */
export function parseRichText(text: string): RichToken[] {
	const tokens: RichToken[] = [];
	const pushText = (value: string) => {
		if (!value) return;
		const last = tokens.at(-1);
		if (last?.kind === 'text') last.text += value;
		else tokens.push({ kind: 'text', text: value });
	};
	let index = 0;
	for (const match of text.matchAll(MARKUP)) {
		pushText(text.slice(index, match.index));
		tokens.push({ kind: match[1] === '^' ? 'sup' : 'sub', text: match[2] });
		index = match.index + match[0].length;
	}
	pushText(text.slice(index));
	return tokens;
}

const GREEK = /([\u0370-\u03FF]+)/u;

/**
 * Splits plain text into runs of Greek letters and the rest. Greek variables (η, σ) exist only
 * in the Mono voice (DESIGN.md §6.7); inside Archivo text the renderer sets them in Mono, so no
 * character falls back to a system font.
 */
export function splitGreek(text: string): { greek: boolean; text: string }[] {
	return text
		.split(GREEK)
		.filter(Boolean)
		.map((part) => ({ greek: GREEK.test(part), text: part }));
}

/** The visible characters, markup removed: what a budget counts (textredaktion-v2.md §0). */
export function plainRichText(text: string): string {
	return parseRichText(text)
		.map((token) => token.text)
		.join('');
}

const NUMBER = /^[−-]?\d[\d,.]*$/;
const WORD = /^\p{L}{3,}/u;

/**
 * How a centre dot is read: between two numbers it separates a series (`4 · 3,5`), before a
 * word it separates two places (`Python · Liste`), otherwise it multiplies (`d · d`).
 */
function speakDot(before: string, after: string): string {
	const left = before.trim().split(/\s+/).at(-1) ?? '';
	const right = after.trim().split(/\s+/)[0] ?? '';
	if ((NUMBER.test(left) && NUMBER.test(right)) || WORD.test(right)) return ', ';
	return ' mal ';
}

/**
 * A spoken version for ReadAloud when content has no `spoken` field: the raised part is read as
 * "hoch", the minus sign as "minus", the centre dot as a pause or as "mal". Formulas with their
 * own spoken text (textredaktion-v2.md §1) never come through here.
 */
export function speakRichText(text: string): string {
	const flat = parseRichText(text)
		.map((token) => (token.kind === 'sup' ? ` hoch ${token.text}` : token.text))
		.join('');
	return flat
		.split(' · ')
		.reduce((spoken, part, index, parts) =>
			index === 0 ? part : spoken + speakDot(parts[index - 1], part) + part
		)
		.replace(/−/g, 'minus ')
		.replace(/\s+/g, ' ')
		.trim();
}
