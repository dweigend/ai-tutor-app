/*
 * The magazine as data: which entries exist, which one leads today, how an article's sources are
 * numbered and how its text is split into blocks and speech segments. Pure functions; relative
 * imports keep the file loadable in Node for article.test.ts.
 */
import type {
	ArticleFacts,
	ArticleParagraph,
	ArticleSection,
	Evidence,
	EssaySource,
	FigureSpec,
	HermesEssay
} from '../../content/types.js';
import {
	articles,
	podcastEpisodes,
	type EditorialArticle,
	type EditorialEpisode
} from '../../content/magazin.js';

export type MagazinEntry =
	{ kind: 'article'; item: EditorialArticle } | { kind: 'episode'; item: EditorialEpisode };

/** Every entry in the issue's order: essays first, then the podcast episodes. */
export function magazinEntries(): MagazinEntry[] {
	return [
		...articles.map((item): MagazinEntry => ({ kind: 'article', item })),
		...podcastEpisodes.map((item): MagazinEntry => ({ kind: 'episode', item }))
	];
}

/** The slug of every `/magazin/[slug]` page, for prerendering (`entries()`). */
export function magazinSlugs(): string[] {
	return magazinEntries().map((entry) => entry.item.id);
}

export function findEntry(slug: string): MagazinEntry | undefined {
	return magazinEntries().find((entry) => entry.item.id === slug);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Index of the entry that leads on this local calendar day; it turns over at midnight. */
export function leadIndex(date: Date, count: number): number {
	if (count <= 0) return 0;
	const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
	return ((day % count) + count) % count;
}

/** Today's lead first, then the others in their issue order. */
export function orderForDay<T>(entries: readonly T[], date: Date): { lead: T; rest: T[] } {
	const index = leadIndex(date, entries.length);
	return { lead: entries[index], rest: entries.filter((_, other) => other !== index) };
}

export interface SourceEntry {
	/** `[01]`: order of first mention in the text, unmentioned sources after them. */
	n: number;
	source: EssaySource;
	/** An extraction gap (Hermes `limitation`) in the evidence that rests on this source. */
	gap: boolean;
	evidence: Evidence[];
}

/**
 * Numbers the sources of a Hermes essay: walking sections and paragraphs in order, each source
 * gets its number when evidence first points to it. Sources no paragraph cites keep their list
 * order behind the cited ones. Evidence that names an unknown source is ignored.
 */
export function numberSources(essay: HermesEssay): SourceEntry[] {
	const byId = new Map(essay.sources.map((source) => [source.sourceId, source]));
	const order: string[] = [];
	for (const section of essay.sections) {
		for (const paragraph of section.paragraphs) {
			for (const evidenceId of paragraph.evidenceIds) {
				const sourceId = essay.evidenceById[evidenceId]?.sourceId;
				if (sourceId && byId.has(sourceId) && !order.includes(sourceId)) order.push(sourceId);
			}
		}
	}
	for (const source of essay.sources) {
		if (!order.includes(source.sourceId)) order.push(source.sourceId);
	}
	const evidence = Object.values(essay.evidenceById);
	return order.map((sourceId, index) => {
		const own = evidence.filter((item) => item.sourceId === sourceId);
		return {
			n: index + 1,
			source: byId.get(sourceId) as EssaySource,
			gap: own.some((item) => item.status === 'limitation'),
			evidence: own
		};
	});
}

/** The source numbers a paragraph points to, once each, in the order of its evidence. */
export function paragraphRefs(
	paragraph: ArticleParagraph,
	essay: HermesEssay,
	entries: readonly SourceEntry[]
): number[] {
	const numberOf = new Map(entries.map((entry) => [entry.source.sourceId, entry.n]));
	const refs: number[] = [];
	for (const evidenceId of paragraph.evidenceIds) {
		const sourceId = essay.evidenceById[evidenceId]?.sourceId;
		const n = sourceId ? numberOf.get(sourceId) : undefined;
		if (n !== undefined && !refs.includes(n)) refs.push(n);
	}
	return refs;
}

export const pad2 = (value: number): string => String(value).padStart(2, '0');

export type InlinePart = { kind: 'text' | 'code'; text: string };

/** Splits inline code in backticks from text; an unmatched backtick stays plain text. */
export function inlineParts(text: string): InlinePart[] {
	const segments = text.split('`');
	if (segments.length % 2 === 0) return [{ kind: 'text', text }];
	return segments
		.map((segment, index): InlinePart => ({ kind: index % 2 ? 'code' : 'text', text: segment }))
		.filter((part) => part.text.length > 0);
}

export type LabelPart = { text: string; unit: boolean };

/** A number with its unit, `20 min` or `4 s`: the pair that stays small in a capital label. */
const UNIT_PAIR = /\d+(?:[.,]\d+)?\s(?:min|s)\b/g;

/**
 * Splits a capital label into text and number-unit pairs (DESIGN.md §6.5): a label in Versalien
 * shows `PODCAST · 20 min`, never `20 MIN`. Pairs carry `unit: true` and are set without capitals.
 */
export function unitParts(text: string): LabelPart[] {
	const parts: LabelPart[] = [];
	let last = 0;
	for (const match of text.matchAll(UNIT_PAIR)) {
		if (match.index > last) parts.push({ text: text.slice(last, match.index), unit: false });
		parts.push({ text: match[0], unit: true });
		last = match.index + match[0].length;
	}
	if (last < text.length) parts.push({ text: text.slice(last), unit: false });
	return parts;
}

/** What a voice reads for a paragraph: its words only, without backticks or markers. */
export function spokenText(text: string): string {
	return text.replaceAll('`', '').replace(/\s+/g, ' ').trim();
}

export type ArticleBlock =
	| { kind: 'paragraph'; paragraph: ArticleParagraph }
	| { kind: 'facts'; facts: ArticleFacts }
	| { kind: 'figure'; figure: FigureSpec };

/**
 * The blocks of a section in reading order: its paragraphs, with facts and figure after the
 * paragraph their anchor names (Hermes placement anchors), or at the end of the section.
 */
export function sectionBlocks(section: ArticleSection): ArticleBlock[] {
	const attached: ArticleBlock[] = [];
	if (section.facts) attached.push({ kind: 'facts', facts: section.facts });
	if (section.figure) attached.push({ kind: 'figure', figure: section.figure });
	const known = new Set(section.paragraphs.map((paragraph) => paragraph.id));
	const after = (block: ArticleBlock): string | undefined => {
		if (block.kind === 'facts') return block.facts.after;
		if (block.kind === 'figure') return block.figure.after;
		return undefined;
	};
	const blocks: ArticleBlock[] = [];
	for (const paragraph of section.paragraphs) {
		blocks.push({ kind: 'paragraph', paragraph });
		blocks.push(...attached.filter((block) => after(block) === paragraph.id));
	}
	blocks.push(...attached.filter((block) => !known.has(after(block) ?? '')));
	return blocks;
}
