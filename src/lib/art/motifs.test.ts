import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (/^\.\.?\/.+\.js$/.test(specifier)) {
			return nextResolve(specifier.replace(/\.js$/, '.ts'), context);
		}
		return nextResolve(specifier, context);
	}
});

const { MOTIFS, MOTIF_WIDTHS, motifFallback, motifSource, motifSrcset } =
	await import('./motifs.js');
const { areas, homeTiles } = await import('../navigation.js');

test('navigation motifs resolve to complete responsive image sets and a WebP fallback', () => {
	for (const link of [...areas, ...homeTiles]) {
		if (link.art) assert.ok(Object.hasOwn(MOTIFS, link.art), link.art);
	}
	for (const id of Object.keys(MOTIFS) as (keyof typeof MOTIFS)[]) {
		assertAsset(motifFallback(id));
		for (const format of ['avif', 'webp'] as const) {
			assert.equal(
				motifSrcset(id, format, (path) => '/base' + path),
				MOTIF_WIDTHS.map((width) => {
					const path = motifSource(id, width, format);
					assertAsset(path);
					return `/base${path} ${width}w`;
				}).join(', ')
			);
		}
	}
});

function assertAsset(asset: string) {
	const file = statSync(new URL(`../../../static${asset}`, import.meta.url), {
		throwIfNoEntry: false
	});
	assert.ok(file?.isFile() && file.size > 0, asset);
}
