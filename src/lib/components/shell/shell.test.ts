import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
const src = new URL('../../../', import.meta.url);
test('the root layout owns the only link to the start page', () => {
	const owners = readdirSync(src, { recursive: true, encoding: 'utf8' }).filter(
		(path) =>
			path.endsWith('.svelte') &&
			/href=\{resolve\('\/'\)\}/.test(readFileSync(new URL(path, src), 'utf8'))
	);
	assert.deepEqual(owners, ['lib/components/shell/GlobalHomeButton.svelte']);
	const layout = readFileSync(new URL('routes/+layout.svelte', src), 'utf8');
	assert.equal(layout.match(/<GlobalHomeButton\b/g)?.length, 1);
});
