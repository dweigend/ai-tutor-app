import { editorialFormulas, type FormulaNode } from '../../math/editorial-formulas.js';
import { speakRichText } from '../../modules/core/rich-text.js';

// A deliberately small Markdown subset for editorial content. The parser returns a typed tree
// that Svelte renders element by element, so content strings never reach the DOM as raw HTML.
// A formula reference on its own line makes a display formula. Backticks represent code.

export type InlineNode =
	| { kind: 'text' | 'strong' | 'em' | 'code'; text: string }
	| { kind: 'formula'; formula: FormulaNode };

export type MarkdownBlock =
	| { kind: 'paragraph'; inlines: InlineNode[] }
	| { kind: 'formula'; formula: FormulaNode }
	| { kind: 'list'; ordered: boolean; items: InlineNode[][] };

const INLINE_TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|\{\{math:[\w-]+\}\})/g;
const BULLET = /^- /;
const NUMBERED = /^\d+\. /;
const FORMULA = /^\{\{math:([\w-]+)\}\}$/;

function formulaFor(token: string): FormulaNode | undefined {
	const id = FORMULA.exec(token)?.[1];
	return id ? editorialFormulas.get(id) : undefined;
}

function inlineNode(token: string): InlineNode {
	if (token.startsWith('**')) return { kind: 'strong', text: token.slice(2, -2) };
	if (token.startsWith('`')) return { kind: 'code', text: token.slice(1, -1) };
	if (token.startsWith('*')) return { kind: 'em', text: token.slice(1, -1) };
	const formula = formulaFor(token);
	return formula ? { kind: 'formula', formula } : { kind: 'text', text: token };
}

export function parseInline(source: string): InlineNode[] {
	return source
		.split(INLINE_TOKEN)
		.filter((part) => part.length > 0)
		.map(inlineNode);
}

function parseBlock(chunk: string): MarkdownBlock {
	const lines = chunk.split('\n').map((line) => line.trim());
	if (lines.every((line) => BULLET.test(line))) {
		return {
			kind: 'list',
			ordered: false,
			items: lines.map((line) => parseInline(line.replace(BULLET, '')))
		};
	}
	if (lines.every((line) => NUMBERED.test(line))) {
		return {
			kind: 'list',
			ordered: true,
			items: lines.map((line) => parseInline(line.replace(NUMBERED, '')))
		};
	}
	const text = lines.join(' ');
	const formula = formulaFor(text);
	if (formula) return { kind: 'formula', formula };
	return { kind: 'paragraph', inlines: parseInline(text) };
}

export function parseMarkdown(source: string): MarkdownBlock[] {
	return source
		.split(/\n{2,}/)
		.map((chunk) => chunk.trim())
		.filter((chunk) => chunk.length > 0)
		.map(parseBlock);
}

function speakInline(nodes: InlineNode[]): string {
	return speakRichText(
		nodes.map((node) => (node.kind === 'formula' ? node.formula.spoken : node.text)).join('')
	);
}

export function markdownSpoken(source: string): string {
	return parseMarkdown(source)
		.map((block) => {
			if (block.kind === 'formula') return block.formula.spoken;
			if (block.kind === 'list') return block.items.map(speakInline).join(' ');
			return speakInline(block.inlines);
		})
		.join(' ');
}
