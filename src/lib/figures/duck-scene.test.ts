import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
registerHooks({
	resolve(path, context, next) {
		if (
			path.startsWith('./') &&
			path.endsWith('.js') &&
			context.parentURL?.includes('/src/lib/figures/')
		)
			return next(path.slice(0, -3) + '.ts', context);
		return next(path, context);
	}
});
const { createWebGLCoordinator } = await import('./webgl-coordinator.js');
const { DEFAULT_WARDROBE, toggleAccessory, readWardrobe, saveWardrobe } =
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
	const outfit = toggleAccessory({ ...DEFAULT_WARDROBE }, 'beanie');
	assert.equal(outfit.beanie, true);
	assert.deepEqual(readWardrobe({ getItem: () => '{bad' }), DEFAULT_WARDROBE);
	assert.deepEqual(readWardrobe({ getItem: () => '{"beanie":true,"clubMate":"yes"}' }), outfit);
	assert.equal(
		saveWardrobe(outfit, {
			setItem() {
				throw Error();
			}
		}),
		false
	);
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
	assert.equal(duckClip('wait'), 'idle');
	assert.equal(duckClip('idle_dip'), 'idle');
});
