import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { parse } from 'svelte/compiler';

// Bundler imports use .js specifiers. Resolve them to test the original TypeScript in Node.
registerHooks({
	resolve(specifier, context, nextResolve) {
		if (/^\.\.?\//.test(specifier) && specifier.endsWith('.js')) {
			return nextResolve(specifier.replace(/\.js$/, '.ts'), context);
		}
		return nextResolve(specifier, context);
	}
});

const { youtubeMagazineEntries } = await import('../../content/magazin.js');
const { youtubeEmbed, youtubeWatch } = await import('./youtube.js');

const verifiedIds = [
	'IHZwWFHWa-w',
	'Ilg3gGewQ5U',
	'tIeHLnjs5U8',
	'eMlx5fFNoYc',
	'0VLAoVGf_74',
	'D8GOeCFFby4',
	'bJBEFzlKPoQ',
	'_Ygf0GnlwmY',
	'zzXyPGEtseI',
	'D7_ipDqhtwk'
];

test('the catalog contains the ten verified IDs from six channels and three podcasts', () => {
	assert.deepEqual(
		youtubeMagazineEntries.map(({ videoId }) => videoId),
		verifiedIds
	);
	assert.equal(new Set(youtubeMagazineEntries.map(({ channelUrl }) => channelUrl)).size, 6);
	assert.equal(youtubeMagazineEntries.filter((entry) => entry.category === 'podcast').length, 3);
	for (const entry of youtubeMagazineEntries) {
		assert.equal(entry.kind, 'youtube');
		assert.match(entry.duration, /^(?:\d+:)?\d{1,2}:[0-5]\d$/);
		assert.ok(entry.topicNote && entry.thinkPrompt);
	}
});

test('there is no embed URL before Play; after Play the URL uses YouTube No-Cookie', () => {
	for (const videoId of verifiedIds) {
		assert.equal(youtubeEmbed(videoId, false), undefined);
		assert.equal(
			youtubeEmbed(videoId, true),
			`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`
		);
		assert.equal(youtubeWatch(videoId), `https://www.youtube.com/watch?v=${videoId}`);
	}
});

test('the only iframe and the external fallback are conditional; the poster uses a local motif', () => {
	const source = readFileSync(new URL('./YouTubeCard.svelte', import.meta.url), 'utf8');
	const { fragment } = parse(source, { modern: true });
	const card = fragment.nodes.find(
		(node) => node.type === 'Component' && node.name === 'MediaCard'
	);
	assert.ok(card?.type === 'Component');
	const frame = card.fragment.nodes.find(
		(node) => node.type === 'SnippetBlock' && node.expression.name === 'media'
	);
	assert.ok(frame?.type === 'SnippetBlock');
	const gate = frame.body.nodes.find(
		(node) =>
			node.type === 'IfBlock' && node.test.type === 'Identifier' && node.test.name === 'embed'
	);
	assert.ok(gate?.type === 'IfBlock' && gate.test.type === 'Identifier');
	assert.equal(gate.test.name, 'embed');
	assert.ok(
		gate.consequent.nodes.some((node) => node.type === 'RegularElement' && node.name === 'iframe')
	);
	const poster = gate.alternate?.nodes.find(
		(node) => node.type === 'RegularElement' && node.name === 'div'
	);
	assert.ok(poster?.type === 'RegularElement');
	assert.ok(
		poster.fragment.nodes.some((node) => node.type === 'Component' && node.name === 'MotifImage')
	);
	assert.ok(
		gate.alternate?.nodes.some((node) => node.type === 'RegularElement' && node.name === 'button')
	);
	assert.equal(source.match(/<iframe\b/g)?.length, 1);
	const fallback = card.fragment.nodes.find(
		(node) =>
			node.type === 'IfBlock' && node.test.type === 'Identifier' && node.test.name === 'embed'
	);
	assert.ok(fallback?.type === 'IfBlock');
	assert.ok(
		fallback.consequent.nodes.some(
			(node) =>
				node.type === 'RegularElement' &&
				node.name === 'div' &&
				node.fragment.nodes.some((child) => child.type === 'RegularElement' && child.name === 'a')
		)
	);
	assert.match(source, /<a href=\{youtubeWatch\(/);
	assert.doesNotMatch(source, /ytimg|preconnect|prefetch/i);
});
