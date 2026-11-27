import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

// Bundler imports use .js specifiers. Resolve them to test the original TypeScript in Node.
registerHooks({
	resolve(specifier, context, nextResolve) {
		if (/^\.\.?\//.test(specifier) && specifier.endsWith('.js')) {
			return nextResolve(specifier.replace(/\.js$/, '.ts'), context);
		}
		return nextResolve(specifier, context);
	}
});

const strokesModule = await import('./strokes.js');
const { INKS, anchorPoint, fitStrokes, fromSnapshot, strokeBounds, strokeHit, toSnapshot, toSvg } =
	strokesModule;
const { SKETCH_LIMIT, addSketch, exportFileName, keepSketch, parseSketches, removeSketches } =
	await import('./sketches.js');
const { rememberEdit, stepEdit } = await import('./history.js');
const { refineLocally, simplifyPoints } = await import('./refine.js');
const { IDLE, applyEvent, lineText, whiteboardTurn } = await import('./tutor-line.js');
const { selectTool } = await import('./tool-selection.js');
const { dockMotion } = await import('./dock-motion.js');
const { CHALLENGE_MAX_CHARS, CHALLENGE_TITLE_MAX_CHARS, nextChallenge, whiteboardChallenges } =
	await import('../../content/whiteboard-challenges.js');
const { tutorScenarios } = await import('../../content/tutor.js');

type Stroke = import('./strokes.ts').Stroke;
type SavedSketch = import('./sketches.ts').SavedSketch;

const INK = INKS[0].color;
const ORANGE = INKS[1].color;

function line(from: [number, number], to: [number, number], color: Stroke['color'] = INK): Stroke {
	return { color, points: [from, to].map(([x, y]) => ({ x, y })) };
}

test('two pen colours, ink and orange, nothing else', () => {
	assert.deepEqual(
		INKS.map((ink) => ink.color),
		['#0A0A0A', '#E85D1A']
	);
});

test('direct tool selection preserves the pen color and choosing a color activates the pen', () => {
	const start = { tool: 'pen', color: INK } as const;
	const eraser = selectTool(start, { tool: 'eraser' });
	assert.deepEqual(eraser, { tool: 'eraser', color: INK });
	const orange = selectTool(eraser, { color: ORANGE });
	assert.deepEqual(orange, { tool: 'pen', color: ORANGE });
	assert.deepEqual(selectTool(selectTool(orange, { tool: 'eraser' }), { tool: 'pen' }), orange);
	assert.deepEqual(selectTool(orange, { color: INK }), start);
});

test('dock reversal starts from the current frame and rejects invalid animation durations', () => {
	const samples = [0, 0.5, 1];
	const close = dockMotion(0.4, 0, samples, 16);
	const reopen = dockMotion(0.2, 1, samples, 16);
	assert.deepEqual(close.keyframes[1], reopen.keyframes[0]);
	assert.equal(reopen.duration, 25.6);
	assert.deepEqual(reopen.keyframes.at(-1), { opacity: 1, scale: '1' });
	for (const frameMs of [NaN, Infinity, -1]) {
		assert.deepEqual(dockMotion(0.2, 1, samples, frameMs), { keyframes: [], duration: 0 });
	}
	assert.equal(dockMotion(NaN, 1, samples, 16).duration, 0);
});

test('snapshot keeps coordinates in [0, 1] and drops colours; fromSnapshot returns ink', () => {
	const snapshot = toSnapshot([line([0.123456, 0.5], [0.4, 0.99999], ORANGE)], 'b', 3);
	assert.deepEqual(snapshot, {
		boardId: 'b',
		revision: 3,
		strokes: [
			{
				points: [
					{ x: 0.1235, y: 0.5 },
					{ x: 0.4, y: 1 }
				]
			}
		]
	});
	assert.equal(fromSnapshot(snapshot)[0].color, INK);
});

test('fitStrokes leaves a sketch that fits and scales one that does not, without distortion', () => {
	const view = { x: 0.46, y: 1 };
	const inside = [line([0.1, 0.1], [0.3, 0.8])];
	assert.deepEqual(fitStrokes(inside, view), inside);

	// A 4:3 board sketch from a desktop reaches x = 0.9 and must shrink into a phone view.
	const wide = [line([0.1, 0.2], [0.9, 0.6])];
	const fitted = fitStrokes(wide, view);
	const bounds = strokeBounds(fitted)!;
	assert.ok(bounds.maxX <= view.x + 1e-9);
	assert.ok(bounds.maxY <= view.y + 1e-9);
	const ratioBefore = (0.9 - 0.1) / (0.6 - 0.2);
	const ratioAfter = (bounds.maxX - bounds.minX) / (bounds.maxY - bounds.minY);
	assert.ok(Math.abs(ratioBefore - ratioAfter) < 1e-9);
});

test('anchorPoint finds the highest and the lowest ink point', () => {
	const strokes = [line([0.1, 0.5], [0.2, 0.3]), line([0.3, 0.7], [0.35, 0.6])];
	assert.deepEqual(anchorPoint(strokes, 'top'), { x: 0.2, y: 0.3 });
	assert.deepEqual(anchorPoint(strokes, 'bottom'), { x: 0.3, y: 0.7 });
	assert.equal(anchorPoint([], 'top'), null);
});

test('the eraser hits a stroke near its segment and misses it beyond the radius', () => {
	const stroke = line([0.1, 0.1], [0.3, 0.1]);
	assert.ok(strokeHit(stroke, { x: 0.2, y: 0.11 }, 0.015));
	assert.ok(!strokeHit(stroke, { x: 0.2, y: 0.13 }, 0.015));
});

test('SVG export: one format with both inks, white ground, no third colour', () => {
	const svg = toSvg([line([0.1, 0.1], [0.2, 0.2]), line([0.3, 0.3], [0.4, 0.4], ORANGE)], {
		x: 0.5,
		y: 1
	});
	assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 500 1000"/);
	assert.match(svg, /stroke="#0A0A0A"/);
	assert.match(svg, /stroke="#E85D1A"/);
	const colours = new Set(svg.match(/#[0-9A-F]{6}/g));
	assert.deepEqual([...colours].sort(), ['#0A0A0A', '#E85D1A', '#FFFFFF']);
});

function sketch(id: string, kept = false): SavedSketch {
	return { id, savedAt: '2026-11-26T14:32:00.000Z', strokes: [line([0.1, 0.1], [0.2, 0.2])], kept };
}

test('saved sketches: newest first, the limit drops the oldest sketch that is not kept', () => {
	let list: SavedSketch[] = [sketch('kept', true)];
	for (let index = 0; index < SKETCH_LIMIT; index += 1) {
		const next = addSketch(list, sketch(`s${index}`));
		assert.ok(next);
		list = next;
	}
	assert.equal(list.length, SKETCH_LIMIT);
	assert.equal(list[0].id, `s${SKETCH_LIMIT - 1}`);
	assert.ok(list.some((item) => item.id === 'kept'));
	assert.ok(!list.some((item) => item.id === 's0'));
});

test('saved sketches: keep and remove', () => {
	const list = [sketch('a'), sketch('b')];
	assert.equal(keepSketch(list, 'b', true)[1].kept, true);
	assert.deepEqual(
		removeSketches(list, new Set(['a'])).map((item) => item.id),
		['b']
	);
});

test('parseSketches drops broken entries and never trusts foreign colours', () => {
	const good = sketch('ok');
	const foreign = { ...sketch('red'), strokes: [{ ...line([0, 0], [1, 1]), color: '#B81444' }] };
	const outside = { ...sketch('out'), strokes: [line([0, 0], [1.5, 1])] };
	const raw = JSON.stringify([good, foreign, outside, { id: 'x' }, 42]);
	assert.deepEqual(
		parseSketches(raw).map((item) => item.id),
		['ok']
	);
	assert.deepEqual(parseSketches('{not json'), []);
	assert.deepEqual(parseSketches(null), []);
});

test('export file name carries the local date and time', () => {
	assert.equal(exportFileName(new Date(2026, 10, 26, 9, 5)), 'skizze-2026-11-26-0905.svg');
});

test('Aufbereiten straightens a wobbly line and keeps a corner', () => {
	const wobble = Array.from({ length: 21 }, (_, index) => ({
		x: 0.1 + index * 0.01,
		y: 0.5 + (index % 2 ? 0.002 : -0.002)
	}));
	assert.equal(simplifyPoints(wobble).length, 2);

	const corner = [
		{ x: 0.1, y: 0.1 },
		{ x: 0.2, y: 0.1 },
		{ x: 0.3, y: 0.1 },
		{ x: 0.3, y: 0.2 },
		{ x: 0.3, y: 0.3 }
	];
	assert.deepEqual(simplifyPoints(corner), [corner[0], corner[2], corner[4]]);

	const result = refineLocally([{ color: ORANGE, points: wobble }]);
	assert.equal(result.pointsBefore, 21);
	assert.equal(result.pointsAfter, 2);
	assert.equal(result.strokes[0].color, ORANGE);
});

test('six approved challenges, one line of at most 48 characters, cycled in order', () => {
	assert.equal(whiteboardChallenges.length, 6);
	for (const challenge of whiteboardChallenges) {
		assert.ok([...challenge.title].length <= CHALLENGE_TITLE_MAX_CHARS, challenge.title);
		assert.ok([...challenge.text].length <= CHALLENGE_MAX_CHARS, challenge.text);
		assert.doesNotMatch(challenge.title + challenge.text, /η/);
		assert.ok(!challenge.text.includes('\n'));
		assert.ok(!/[a-zäöüß]!/.test(challenge.text));
	}
	assert.equal(whiteboardChallenges[2].text, 'Zeichne L = (a · b + c)² und beide Pfade d → L.');
	let current = null;
	const seen = new Set<string>();
	for (let index = 0; index < 6; index += 1) {
		current = nextChallenge(current);
		seen.add(current.id);
	}
	assert.equal(seen.size, 6);
	assert.equal(nextChallenge(current).id, whiteboardChallenges[0].id);
});

test('a challenge scenario link points at a real tutor scenario', () => {
	for (const challenge of whiteboardChallenges) {
		if (!challenge.scenarioId) continue;
		assert.ok(tutorScenarios.some((scenario) => scenario.id === challenge.scenarioId));
	}
});

test('tutor line: deltas stream in, the final message wins, errors carry their code', () => {
	const task = { courseId: 'c', courseVersion: '1', taskId: 't' };
	const snapshot = toSnapshot([line([0.1, 0.1], [0.2, 0.2])], 'b', 1);
	const request = whiteboardTurn({
		task,
		sessionId: 's',
		expectedRevision: 0,
		requestId: 'r',
		snapshot
	});
	assert.deepEqual(request.input, { kind: 'whiteboard', snapshot });

	assert.equal(lineText(IDLE), null);
	let state = applyEvent({ phase: 'asking' }, { type: 'delta', text: 'Welche ' });
	state = applyEvent(state, { type: 'delta', text: 'Strecke?' });
	assert.equal(lineText(state), 'Welche Strecke?');

	const response = {
		requestId: 'r',
		session: {
			id: 's',
			task,
			revision: 1,
			state: { attempts: 1, hintsRemaining: 3, explanationAvailable: false }
		},
		learnerMessage: null,
		outcome: 'reply' as const,
		message: {
			id: 'm',
			role: 'tutor' as const,
			text: 'Welche Strecke zeigt die Abweichung?',
			move: 'nachhaken' as const,
			media: []
		}
	};
	const done = applyEvent(state, { type: 'done', response });
	assert.deepEqual(done, {
		phase: 'done',
		text: 'Welche Strecke zeigt die Abweichung?',
		revision: 1
	});

	const failed = applyEvent(state, {
		type: 'error',
		problem: { code: 'conflict', message: 'Geändert.', retryable: true }
	});
	assert.deepEqual(failed, { phase: 'error', text: 'Geändert.', code: 'conflict' });
});

test('a full kept history refuses a new sketch and saves it once a slot can be replaced', () => {
	const list = Array.from({ length: SKETCH_LIMIT }, (_, index) => sketch(`s${index}`, true));
	const incoming = sketch('new');
	assert.equal(addSketch(list, incoming), null);
	assert.equal(list.length, SKETCH_LIMIT);

	const next = addSketch(keepSketch(list, 's3', false), incoming);
	assert.deepEqual(next, [incoming, ...list.filter((item) => item.id !== 's3')]);
});

test('redo restores the undone drawing and a new edit discards redo', () => {
	const before = sketch('before').strokes;
	const after = [...before, line([0, 0], [0.2, 0.2])];
	const history = rememberEdit({ undo: [], redo: [] }, before);

	const undone = stepEdit(history, after, 'undo');
	assert.ok(undone);
	assert.equal(undone.strokes, before);

	const redone = stepEdit(undone.history, undone.strokes, 'redo');
	assert.ok(redone);
	assert.equal(redone.strokes, after);
	assert.deepEqual(redone.history, history);

	const edited = rememberEdit(undone.history, undone.strokes);
	assert.equal(stepEdit(edited, [], 'redo'), null);
});
