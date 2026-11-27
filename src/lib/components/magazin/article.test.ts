import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import type { HermesEssay } from '../../content/types.js';

// Bundler imports use .js specifiers. Resolve them to test the original TypeScript in Node.
registerHooks({
	resolve(specifier, context, nextResolve) {
		if (/^\.\.?\//.test(specifier) && specifier.endsWith('.js')) {
			return nextResolve(specifier.replace(/\.js$/, '.ts'), context);
		}
		return nextResolve(specifier, context);
	}
});

const { articles, essays, podcastEpisodes, evidenceGaps } =
	await import('../../content/magazin.js');
const {
	findEntry,
	inlineParts,
	leadIndex,
	magazinSlugs,
	numberSources,
	orderForDay,
	paragraphRefs,
	sectionBlocks,
	spokenText,
	unitParts
} = await import('./article.js');

/** Private-use code points have no glyph in any app font and must never reach a voice. */
const PRIVATE_USE = /[\u{E000}-\u{F8FF}\u{F0000}-\u{FFFFD}]/u;

test('the legacy essays read exactly the words of the Hermes articles', () => {
	assert.equal(essays.length, articles.length);
	articles.forEach((article, index) => {
		const essay = essays[index];
		assert.equal(essay.id, article.id);
		assert.equal(essay.title, article.title);
		assert.equal(essay.sections.length, article.sections.length);
		article.sections.forEach((section, s) => {
			assert.equal(essay.sections[s].heading, section.heading);
			assert.equal(
				essay.sections[s].markdown,
				section.paragraphs.map((paragraph) => paragraph.text).join('\n\n')
			);
		});
		assert.deepEqual(
			essay.sources,
			article.sources.map(({ label, href }) => ({ label, href }))
		);
	});
});

test('title and question are kept apart; questions and teasers fit their budgets', () => {
	for (const entry of [...articles, ...podcastEpisodes]) {
		assert.ok(entry.question.length <= 44, `${entry.id}: ${entry.question.length}`);
		assert.notEqual(entry.question, '');
		// The teaser stands in full in the index opener (DESIGN.md §10.1).
		assert.ok(entry.teaser.length <= 88, `${entry.id}: ${entry.teaser.length}`);
	}
	const kalibrierung = articles.find((article) => article.id === 'wie-sicher-sind-sie');
	assert.equal(kalibrierung?.title, 'Wie sicher bist du dir bei dieser Antwort?');
	assert.equal(kalibrierung?.question, 'Wie prüfst du, ob deine Sicherheit stimmt?');
});

test('every paragraph id is unique and every evidence id resolves to a listed source', () => {
	const ids = new Set<string>();
	for (const article of articles) {
		const sourceIds = new Set(article.sources.map((source) => source.sourceId));
		for (const section of article.sections) {
			section.paragraphs.forEach((paragraph, index) => {
				assert.equal(paragraph.id, `${section.id}-p${index}`);
				assert.ok(!ids.has(paragraph.id), paragraph.id);
				ids.add(paragraph.id);
				for (const evidenceId of paragraph.evidenceIds) {
					const evidence = article.evidenceById[evidenceId];
					assert.ok(evidence, `${article.id}: ${evidenceId}`);
					assert.ok(sourceIds.has(evidence.sourceId), `${article.id}: ${evidence.sourceId}`);
				}
			});
		}
		assert.equal(evidenceGaps(article).length, 0);
	}
});

test('each essay anchors one interactive figure and two different motifs in the running text', () => {
	for (const article of articles) {
		const anchors = article.sections.flatMap((section) => section.paragraphs.map(({ id }) => id));
		assert.ok(anchors.includes(article.figure.after), article.id);
		assert.equal(article.inlineImages.length, 2);
		assert.equal(new Set(article.inlineImages.map(({ motif }) => motif)).size, 2);
		for (const image of article.inlineImages) assert.ok(anchors.includes(image.after), image.after);
		for (const section of article.sections) {
			const ids = section.paragraphs.map((paragraph) => paragraph.id);
			assert.equal(section.figure, undefined);
			if (section.facts) {
				assert.ok(section.facts.cells.length <= 4);
				if (section.facts.after) assert.ok(ids.includes(section.facts.after));
			}
		}
	}
});

test('sources are numbered by first mention, uncited ones keep their list order behind', () => {
	const kalibrierung = articles.find((article) => article.id === 'wie-sicher-sind-sie');
	assert.ok(kalibrierung);
	const entries = numberSources(kalibrierung);
	assert.deepEqual(
		entries.map((entry) => entry.source.sourceId),
		[
			'aufgabe-softmax',
			'guo',
			'zellKrizan',
			'rozenblit-keil-2002',
			'carpenter-2013',
			'recherche-selbsteinschaetzung'
		]
	);
	assert.deepEqual(
		entries.map((entry) => entry.n),
		[1, 2, 3, 4, 5, 6]
	);
	const menschen = kalibrierung.sections.find((section) => section.id === 'sicher-menschen');
	assert.deepEqual(paragraphRefs(menschen!.paragraphs[1], kalibrierung, entries), [4, 5]);
	// A paragraph citing the same source twice shows its number once.
	const auftakt = kalibrierung.sections[0];
	assert.deepEqual(paragraphRefs(auftakt.paragraphs[1], kalibrierung, entries), [1]);
	// Every article lists each source exactly once.
	for (const article of articles) {
		const numbered = numberSources(article);
		assert.equal(numbered.length, article.sources.length);
		assert.equal(new Set(numbered.map((entry) => entry.source.sourceId)).size, numbered.length);
	}
});

test('a limitation in the evidence marks its source as an extraction gap', () => {
	const essay: HermesEssay = {
		title: 'T',
		question: 'Q',
		sections: [
			{
				id: 's',
				paragraphs: [{ id: 's-p0', text: 'Text', evidenceIds: ['e1', 'missing'] }]
			}
		],
		sources: [
			{ sourceId: 'a', label: 'A', href: 'https://example.org/a' },
			{ sourceId: 'b', label: 'B', href: 'https://example.org/b' }
		],
		evidenceById: {
			e1: { sourceId: 'b', claim: 'Text', status: 'limitation' },
			ghost: { sourceId: 'nowhere', claim: 'x', status: 'complete' }
		}
	};
	const entries = numberSources(essay);
	assert.deepEqual(
		entries.map((entry) => [entry.source.sourceId, entry.n, entry.gap]),
		[
			['b', 1, true],
			['a', 2, false]
		]
	);
	assert.deepEqual(paragraphRefs(essay.sections[0].paragraphs[0], essay, entries), [1]);
});

test('facts and figure follow their anchor paragraph, an unknown anchor the section end', () => {
	const section = {
		id: 'x',
		paragraphs: [
			{ id: 'x-p0', text: 'a', evidenceIds: [] },
			{ id: 'x-p1', text: 'b', evidenceIds: [] }
		],
		facts: { cells: [{ label: 'L', value: 'V' }], after: 'nowhere' },
		figure: {
			kind: 'bars' as const,
			after: 'x-p0',
			title: 'T',
			caption: 'C',
			bars: [{ label: 'a', value: 1 }]
		}
	};
	assert.deepEqual(
		sectionBlocks(section).map((block) => block.kind),
		['paragraph', 'figure', 'paragraph', 'facts']
	);
});

test('speech reads words only: no backticks, no glyphs; inline code is split for display', () => {
	assert.equal(
		spokenText('Ihr Test prüft `x * x` an der Stelle 3.'),
		'Ihr Test prüft x * x an der Stelle 3.'
	);
	assert.deepEqual(inlineParts('Klasse `Value`.'), [
		{ kind: 'text', text: 'Klasse ' },
		{ kind: 'code', text: 'Value' },
		{ kind: 'text', text: '.' }
	]);
	assert.deepEqual(inlineParts('ein ` allein'), [{ kind: 'text', text: 'ein ` allein' }]);
	for (const article of articles) {
		for (const section of article.sections) {
			for (const paragraph of section.paragraphs) {
				const spoken = spokenText(paragraph.text);
				assert.ok(!spoken.includes('`'));
				assert.ok(!PRIVATE_USE.test(spoken));
				assert.ok(!/\[\d+\]/.test(spoken));
			}
		}
	}
});

test('one page per slug: every article and episode is prerendered, none twice', () => {
	const slugs = magazinSlugs();
	assert.equal(slugs.length, articles.length + podcastEpisodes.length);
	assert.equal(new Set(slugs).size, slugs.length);
	assert.equal(findEntry('die-gruene-lampe-luegt')?.kind, 'episode');
	assert.equal(findEntry('wie-sicher-sind-sie')?.kind, 'article');
	assert.equal(findEntry('nichts'), undefined);
});

test('the lead turns over at local midnight and walks through every entry', () => {
	const evening = new Date(2026, 11, 1, 23, 59);
	const morning = new Date(2026, 11, 2, 0, 1);
	assert.equal(leadIndex(morning, 5), (leadIndex(evening, 5) + 1) % 5);
	const seen = new Set<number>();
	for (let day = 0; day < 5; day += 1) seen.add(leadIndex(new Date(2026, 0, 1 + day, 12), 5));
	assert.equal(seen.size, 5);
	const { lead, rest } = orderForDay(['a', 'b', 'c'], new Date(2026, 0, 1));
	assert.equal(rest.length, 2);
	assert.ok(!rest.includes(lead));
});

test('number and unit stay one small pair inside a capital label', () => {
	assert.deepEqual(unitParts('Podcast · 20 min'), [
		{ text: 'Podcast · ', unit: false },
		{ text: '20 min', unit: true }
	]);
	assert.deepEqual(unitParts('Denkpause · weiter in 4 s'), [
		{ text: 'Denkpause · weiter in ', unit: false },
		{ text: '4 s', unit: true }
	]);
	assert.deepEqual(unitParts('Essay · 4 min · Lernen'), [
		{ text: 'Essay · ', unit: false },
		{ text: '4 min', unit: true },
		{ text: ' · Lernen', unit: false }
	]);
	// Words that merely start like a unit stay text.
	assert.deepEqual(unitParts('Folge 1 · Prüfen'), [{ text: 'Folge 1 · Prüfen', unit: false }]);
	assert.deepEqual(unitParts('3 sind'), [{ text: '3 sind', unit: false }]);
});
