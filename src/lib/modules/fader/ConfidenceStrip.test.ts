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

test('confidence renders its question as visible text and uses it to name the rating', () => {
	const { body } = render(ConfidenceStrip, { props: { value: 50 } });
	const label = body.match(/<p class="confidence-label" id="([^"]+)">Wie sicher\?<\/p>/);
	assert.ok(label);
	assert.match(body, new RegExp(`<div[^>]+aria-labelledby="${label[1]}"[^>]+role="slider"`));
	assert.equal([...body.matchAll(/class="confidence-segment"/g)].length, 4);
	assert.equal([...body.matchAll(/data-filled="true"/g)].length, 2);
	assert.match(body, /<button[^>]+class="m-hit confidence-none"[^>]*>\s*ohne Angabe/);
});
