import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { compile, compileModule } from 'svelte/compiler';
import { render } from 'svelte/server';

// Node renders the same Svelte components as Kit, including the actual Bits UI rating.
registerHooks({
	resolve(specifier, context, nextResolve) {
		if (
			/^\.\.?\//.test(specifier) &&
			specifier.endsWith('.js') &&
			context.parentURL?.includes('/src/lib/')
		) {
			return nextResolve(specifier.replace(/\.js$/, '.ts'), context);
		}
		return nextResolve(specifier, context);
	},
	load(url, context, nextLoad) {
		if (!url.endsWith('.svelte') && !url.endsWith('.svelte.js')) return nextLoad(url, context);
		const file = new URL(url);
		const compiler = url.endsWith('.svelte') ? compile : compileModule;
		return {
			format: 'module',
			shortCircuit: true,
			source: compiler(readFileSync(file, 'utf8'), { generate: 'server', filename: file.pathname })
				.js.code
		};
	}
});

const { default: ConfidenceStrip } = await import('./ConfidenceStrip.svelte');

test('confidence shows no helper words; its name and reading stay for screen readers', () => {
	const { body } = render(ConfidenceStrip, { props: { value: 75 } });
	assert.match(body, /<div[^>]+role="group"[^>]+aria-label="Wie sicher\?"/);
	assert.doesNotMatch(body, /confidence-label|confidence-reading/);
	assert.doesNotMatch(body, />\s*(Wie sicher\?|ohne Angabe|ziemlich sicher)\s*</);
	assert.match(body, /aria-valuetext="ziemlich sicher, 75 Prozent"/);
});

test('confidence is one − … + slider with a marked middle, no circles, no extra button', () => {
	const { body } = render(ConfidenceStrip, { props: { value: 75 } });
	assert.equal([...body.matchAll(/role="slider"/g)].length, 1);
	assert.equal([...body.matchAll(/class="fader-tick/g)].length, 5);
	assert.equal([...body.matchAll(/data-middle="true"/g)].length, 1);
	// − and + are finger shortcuts beside the axis; they stay out of the tab order.
	const ends = [
		...body.matchAll(/<button[^>]*class="confidence-end[^"]*"[^>]*>([^<]*)<\/button>/g)
	];
	assert.deepEqual(
		ends.map((end) => end[1].trim()),
		['−', '+']
	);
	for (const end of ends) assert.match(end[0], /tabindex="-1"/);
	assert.equal([...body.matchAll(/<button/g)].length, 2);
	assert.doesNotMatch(body, /confidence-segment|confidence-none|ohne Angabe<\/button>/);
	assert.match(body, /aria-valuetext="ziemlich sicher, 75 Prozent"/);
	assert.match(body, /class="confidence-fill/);
});

test('untouched, the grip rests in the middle without a written reading', () => {
	const { body } = render(ConfidenceStrip, { props: {} });
	assert.doesNotMatch(body, /data-touched/);
	assert.match(body, /aria-valuetext="nicht gewählt"/);
	assert.doesNotMatch(body, />\s*ohne Angabe\s*</);
	assert.doesNotMatch(body, /class="confidence-fill/);
});

test('"ohne Angabe" (null) is the touched middle', () => {
	const { body } = render(ConfidenceStrip, { props: { value: null } });
	assert.match(body, /data-touched="true"/);
	assert.match(body, /aria-valuetext="ohne Angabe"/);
	assert.match(body, /data-side="middle"/);
});
