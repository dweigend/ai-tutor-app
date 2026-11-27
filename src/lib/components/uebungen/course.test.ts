import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import { compileModule } from 'svelte/compiler';

const libUrl = new URL('../../', import.meta.url).href;

registerHooks({
	resolve(specifier, context, nextResolve) {
		// Only the repository's TypeScript sources use .js as a build-time specifier.
		if (
			context.parentURL?.startsWith(libUrl) &&
			/^\.\.?\//.test(specifier) &&
			specifier.endsWith('.js')
		) {
			return nextResolve(specifier.replace(/\.js$/, '.ts'), context);
		}
		return nextResolve(specifier, context);
	},
	load(url, context, nextLoad) {
		if (!url.endsWith('/practice.svelte.ts')) return nextLoad(url, context);
		const source = stripTypeScriptTypes(readFileSync(new URL(url), 'utf8'));
		return {
			format: 'module',
			shortCircuit: true,
			source: compileModule(source, { generate: 'client' }).js.code
		};
	}
});

const { exerciseHref, openExercises } = await import('./course.js');
const { markDone, practice, resetPractice, settleSwipe, swiped } =
	await import('./practice.svelte.js');

test('the open course retains numbering and puts postponed tasks last', () => {
	const [first, second, third, fourth] = openExercises([]);
	const id = ({ exercise }: typeof first) => exercise.task.taskId;
	const open = openExercises([id(first)], [id(second)], [id(fourth), id(third)]);
	assert.deepEqual(
		open.map(({ number }) => number),
		[5, 6, 7, 8, 9, 4, 3]
	);
	assert.equal(exerciseHref('./uebungen', 'a/b'), './uebungen?task=a%2Fb');
});

test('completed exercises disappear and restarting restores all nine rows and swipe state', () => {
	const initial = openExercises([]);
	const ids = initial.map(({ exercise }) => exercise.task.taskId);
	markDone(ids[0]);
	markDone(ids[0]);
	assert.equal(practice.done.length, 1);
	assert.deepEqual(openExercises(practice.done), initial.slice(1));

	swiped(ids[1], 'dismiss');
	settleSwipe();
	swiped(ids[2], 'later');
	settleSwipe();
	swiped(ids[3], 'later');
	for (const id of ids.slice(1)) markDone(id);
	assert.deepEqual(openExercises(practice.done), []);

	resetPractice();
	assert.deepEqual(openExercises(practice.done, practice.hidden, practice.later), initial);
	assert.deepEqual(practice.hidden, []);
	assert.deepEqual(practice.later, []);
	assert.deepEqual(practice.generations, {});
	assert.equal(practice.pending, null);
});
