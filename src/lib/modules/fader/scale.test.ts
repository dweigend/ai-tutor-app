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

const {
	CONFIDENCE_DETENTS,
	SPECTRUM_DETENTS,
	confidenceDetent,
	confidenceLevel,
	confidenceText,
	detentConfidence,
	evenDetents,
	levelConfidence,
	magnetPosition,
	nearestDetent,
	spectrumAnswer,
	spectrumChoice,
	spectrumCommittable,
	spectrumFlood,
	spectrumReading,
	stepDetent
} = await import('./scale.js');

test('nine detents: the middle and four certainty steps on each side', () => {
	assert.equal(SPECTRUM_DETENTS.length, 9);
	assert.deepEqual(
		SPECTRUM_DETENTS.map((detent) => spectrumReading(detent).certainty),
		[100, 75, 50, 25, null, 25, 50, 75, 100]
	);
});

test('the display word switches hard at the middle', () => {
	assert.equal(spectrumReading(0).word, 'UNSICHER');
	assert.equal(spectrumReading(0.49).word, 'UNSICHER');
	assert.equal(spectrumReading(0.51).word, 'JA');
	assert.equal(spectrumReading(-0.51).word, 'NEIN');
	assert.equal(spectrumReading(3).valuetext, 'Ja, 75 Prozent sicher');
	assert.equal(spectrumReading(-4).valuetext, 'Nein, 100 Prozent sicher');
});

test('the flood runs from the middle to the grip and is off in the middle', () => {
	assert.equal(spectrumFlood(0), null);
	assert.equal(spectrumFlood(0.4), null);
	// Full JA floods the right half, full NEIN the left half.
	assert.deepEqual(spectrumFlood(4), { from: 0.5, to: 1 });
	assert.deepEqual(spectrumFlood(-4), { from: 0, to: 0.5 });
	assert.deepEqual(spectrumFlood(2), { from: 0.5, to: 0.75 });
	assert.deepEqual(spectrumFlood(-2), { from: 0.25, to: 0.5 });
	// The edge follows the grip between detents, too.
	assert.deepEqual(spectrumFlood(2.4), { from: 0.5, to: 0.8 });
	// More commitment, more yellow: the flooded share grows with the distance from the middle.
	const flooded = (position: number) => {
		const flood = spectrumFlood(position);
		return flood ? flood.to - flood.from : 0;
	};
	assert.ok(flooded(1) < flooded(2) && flooded(2) < flooded(3) && flooded(3) < flooded(4));
	assert.ok(flooded(-1) < flooded(-3));
	assert.equal(flooded(-3), flooded(3));
});

test('a committed spectrum maps onto the confidence values of the API', () => {
	assert.deepEqual(spectrumAnswer(0), { answer: null, confidence: null });
	assert.deepEqual(spectrumAnswer(1), { answer: 'ja', confidence: 25 });
	assert.deepEqual(spectrumAnswer(-4), { answer: 'nein', confidence: 100 });
});

test('detents: nearest, magnet zone, key steps', () => {
	const detents = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
	assert.equal(nearestDetent(1.4, detents), 1);
	assert.equal(nearestDetent(1.6, detents), 2);
	assert.equal(magnetPosition(2.1, detents), 2);
	assert.equal(magnetPosition(2.4, detents), 2.4);
	assert.equal(stepDetent(0, detents, 1), 1);
	assert.equal(stepDetent(4, detents, 1), 4);
	assert.equal(stepDetent(-3.9, detents, -3), -4);
	assert.deepEqual(evenDetents(0.02, 0.12, 0.02), [0.02, 0.04, 0.06, 0.08, 0.1, 0.12]);
});

test('confidence strip: levels, readings, "ohne Angabe"', () => {
	assert.equal(confidenceLevel(75), 3);
	assert.equal(confidenceLevel(null), 0);
	assert.equal(confidenceLevel(undefined), 0);
	assert.equal(levelConfidence(4), 100);
	assert.equal(levelConfidence(0), undefined);
	assert.equal(confidenceText(75), 'ziemlich sicher, 75 Prozent');
	assert.equal(confidenceText(null), 'ohne Angabe');
});

test('untouched middle is locked, a deliberately set middle is an abstention', () => {
	// Untouched: the grip only rests in the middle, "Festlegen" stays locked.
	assert.equal(spectrumCommittable(false), false);
	assert.equal(spectrumChoice(0, false), null);
	// Moved and set back to the middle: UNSICHER counts like any other detent.
	assert.equal(spectrumCommittable(true), true);
	assert.deepEqual(spectrumChoice(0, true), { answer: null, confidence: null });
	assert.deepEqual(spectrumChoice(3, true), { answer: 'ja', confidence: 75 });
});

test('confidence slider: − is unsure, the marked middle is "ohne Angabe", + is sure', () => {
	assert.deepEqual(
		CONFIDENCE_DETENTS.map((detent) => detentConfidence(detent)),
		[25, 50, null, 75, 100]
	);
	// Untouched and "ohne Angabe" both rest in the middle.
	assert.equal(confidenceDetent(undefined), 0);
	assert.equal(confidenceDetent(null), 0);
	for (const confidence of [25, 50, 75, 100] as const) {
		assert.equal(detentConfidence(confidenceDetent(confidence)), confidence);
	}
	// A free grip position reads as its nearest detent.
	assert.equal(detentConfidence(0.4), null);
	assert.equal(detentConfidence(1.6), 100);
	assert.equal(detentConfidence(-0.6), 50);
});
