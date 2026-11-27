import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
// Bundler specifiers end in .js; inside src/lib they resolve to the TypeScript sources.
registerHooks({
	resolve(path, context, next) {
		if (/^\.\.?\//.test(path) && path.endsWith('.js') && context.parentURL?.includes('/src/lib/')) {
			const source = new URL(path.slice(0, -3) + '.ts', context.parentURL);
			if (existsSync(source)) return next(source.href, context);
		}
		return next(path, context);
	}
});
const { createWebGLCoordinator } = await import('./webgl-coordinator.js');
const { ACCESSORIES, DEFAULT_WARDROBE, accessoriesFor, toggleHipster, readWardrobe, saveWardrobe } =
	await import('./duck-wardrobe.js');
const { duckCameraDistance } = await import('./duck-scene.js');
test('revoke before granting and resume queued owners by priority', () => {
	const coordinator = createWebGLCoordinator(),
		events: string[] = [];
	const get = (p: 'stage' | 'tile' | 'companion') =>
		coordinator.request(p, (a) => events.push(p + ':' + a));
	const companion = get('companion'),
		tile = get('tile'),
		stage = get('stage');
	stage();
	tile();
	companion();
	assert.deepEqual(events, [
		'companion:true',
		'companion:false',
		'tile:true',
		'tile:false',
		'stage:true',
		'stage:false',
		'tile:true',
		'tile:false',
		'companion:true',
		'companion:false'
	]);
});
test('wardrobe ignores malformed flags and reports unavailable storage', () => {
	const hipster = toggleHipster({ ...DEFAULT_WARDROBE });
	assert.deepEqual(hipster, { glasses: true, hipster: true });
	assert.deepEqual(readWardrobe({ getItem: () => '{bad' }), DEFAULT_WARDROBE);
	assert.deepEqual(readWardrobe({ getItem: () => '{"hipster":true,"glasses":"yes"}' }), hipster);
	assert.equal(
		saveWardrobe(hipster, {
			setItem() {
				throw Error();
			}
		}),
		false
	);
});
test('everyday duck wears glasses, the hipster easter egg shows all three accessories', () => {
	assert.deepEqual(accessoriesFor({}), { glasses: true, beanie: false, clubMate: false });
	assert.deepEqual(accessoriesFor({ glasses: false }), {
		glasses: false,
		beanie: false,
		clubMate: false
	});
	assert.deepEqual(accessoriesFor({ glasses: false, hipster: true }), {
		glasses: true,
		beanie: true,
		clubMate: true
	});
});
test('nearest box corners fit both fields of view in portrait and shallow tiles', () => {
	for (const [w, h] of [
		[390, 664],
		[390, 844],
		[844, 390],
		[1280, 800],
		[600, 110]
	]) {
		const distance = duckCameraDistance(3.8, 4, 3.8, w / h);
		const halfHeight = (distance - 1.9) * Math.tan((16 * Math.PI) / 180);
		assert.ok(halfHeight > 2 && (halfHeight * w) / h > 1.9);
	}
});

test('runtime pose aliases resolve to shipped clips in the 15-joint rig', async () => {
	const { readFileSync } = await import('node:fs');
	const { DUCK_POSES, duckClip } = await import('./index.js');
	const binary = readFileSync(new URL('../../../static/models/duck_v3.glb', import.meta.url));
	const manifest = JSON.parse(binary.toString('utf8', 20, 20 + binary.readUInt32LE(12)));
	assert.deepEqual(
		new Set(manifest.animations.map((clip: { name: string }) => clip.name)),
		new Set(DUCK_POSES)
	);
	assert.equal(manifest.skins[0].joints.length, 15);
	// Exactly the body and the three accessories; the wardrobe names every accessory mesh.
	assert.deepEqual(
		manifest.meshes.map((mesh: { name: string }) => mesh.name).sort(),
		['duck_body', ...Object.values(ACCESSORIES)].sort()
	);
	assert.ok(binary.length <= 819200, 'GLB budget 800 KiB (DESIGN.md §9.2d)');
	assert.equal(duckClip('wait'), 'idle');
	assert.equal(duckClip('idle_dip'), 'idle');
});
