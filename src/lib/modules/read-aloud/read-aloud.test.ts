import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import type { SpeakOptions, SpeechAdapter, SpeechSegment } from './speech.js';

// Bundler imports use .js specifiers. Resolve them to test the original TypeScript in Node.
registerHooks({
	resolve(specifier, context, nextResolve) {
		if (/^\.\.?\//.test(specifier) && specifier.endsWith('.js')) {
			return nextResolve(specifier.replace(/\.js$/, '.ts'), context);
		}
		return nextResolve(specifier, context);
	}
});

const { createBrowserSpeechAdapter } = await import('./speech.js');
const { createReadAloud, triggerView } = await import('./controller.js');

/** Records every call; the test drives progress by hand. Counts open handles and listeners. */
function mockAdapter(voice = true) {
	const calls: { segments: readonly SpeechSegment[]; options: SpeakOptions }[] = [];
	const voiceListeners = new Set<() => void>();
	let openHandles = 0;
	const adapter: SpeechAdapter = {
		hasVoice: () => voice,
		onVoicesChanged(listener) {
			voiceListeners.add(listener);
			return () => voiceListeners.delete(listener);
		},
		speak(segments, options) {
			calls.push({ segments, options });
			openHandles++;
			let open = true;
			options.onSegment(options.from, 'start');
			return {
				stop() {
					if (open) openHandles--;
					open = false;
				}
			};
		},
		dispose() {}
	};
	return {
		adapter,
		calls,
		voiceListeners,
		get openHandles() {
			return openHandles;
		}
	};
}

function entry(id: string, text: string, scope: string | null = null) {
	return { id, scope, lang: 'de-DE', text: () => text };
}

test('segments register in order and reach the adapter as plain words', () => {
	const mock = mockAdapter();
	const readAloud = createReadAloud(mock.adapter);
	readAloud.register(entry('a', '\n\t\tErster Absatz.\n'));
	readAloud.register(entry('b', 'Zweiter \n\t Absatz.'));
	readAloud.register(entry('empty', ' \n\t '));
	assert.deepEqual(
		readAloud.getState().segments.map((segment) => segment.id),
		['a', 'b', 'empty']
	);

	readAloud.toggle(null);
	const spoken = mock.calls[0].segments;
	assert.deepEqual(
		spoken.map((segment) => segment.id),
		['a', 'b'],
		'a segment without words is skipped'
	);
	assert.equal(spoken[0].text, 'Erster Absatz.');
	assert.equal(spoken[1].text, 'Zweiter Absatz.');
	readAloud.dispose();
});

test('start, pause, resume and end, with no handle left open', () => {
	const mock = mockAdapter();
	const readAloud = createReadAloud(mock.adapter);
	const states: string[] = [];
	readAloud.subscribe((state) => states.push(`${state.status}:${state.activeId ?? '-'}`));
	for (const id of ['a', 'b', 'c']) readAloud.register(entry(id, `Absatz ${id}.`));

	readAloud.toggle(null);
	assert.equal(readAloud.getState().status, 'speaking');
	assert.equal(readAloud.getState().activeId, 'a');
	mock.calls[0].options.onSegment(1, 'start');
	assert.equal(readAloud.getState().activeId, 'b');

	readAloud.toggle(null); // pause
	assert.equal(readAloud.getState().status, 'idle');
	assert.equal(mock.openHandles, 0);

	readAloud.toggle(null); // resume at b
	assert.equal(mock.calls[1].options.from, 1);
	assert.equal(readAloud.getState().activeId, 'b');

	mock.calls[1].options.onEnd();
	assert.equal(readAloud.getState().status, 'idle');
	assert.equal(readAloud.getState().activeId, null);
	assert.equal(mock.openHandles, 0);

	readAloud.toggle(null); // after the end it starts from the top again
	assert.equal(mock.calls[2].options.from, 0);
	readAloud.dispose();
	assert.equal(mock.openHandles, 0);
	assert.ok(states.includes('speaking:a') && states.includes('idle:-'));
});

test('a scope trigger speaks only its scope; unmount ends speech', () => {
	const mock = mockAdapter();
	const readAloud = createReadAloud(mock.adapter);
	readAloud.register(entry('page', 'Seite.'));
	const remove = readAloud.register(entry('card', 'Karte.', 'scope-1'));

	readAloud.toggle('scope-1');
	assert.deepEqual(
		mock.calls[0].segments.map((segment) => segment.id),
		['card']
	);
	remove(); // the block leaves the screen while speaking
	assert.equal(readAloud.getState().status, 'idle');
	assert.equal(mock.openHandles, 0);
	assert.deepEqual(
		readAloud.getState().segments.map((segment) => segment.id),
		['page']
	);
	readAloud.dispose();
});

test('no voice, no adapter or no segment never starts; adapter listeners are released', () => {
	const silent = mockAdapter(false);
	const readAloud = createReadAloud(silent.adapter);
	assert.equal(readAloud.getState().available, false);
	readAloud.toggle(null); // nothing registered
	assert.equal(silent.calls.length, 0);
	assert.equal(readAloud.getState().status, 'idle');

	const voiced = mockAdapter(true);
	readAloud.setAdapter(voiced.adapter);
	assert.equal(silent.voiceListeners.size, 0, 'old adapter listener removed');
	assert.equal(readAloud.getState().available, true);

	readAloud.setAdapter(null);
	readAloud.register(entry('a', 'Text.'));
	readAloud.toggle(null);
	assert.equal(readAloud.getState().status, 'idle');

	readAloud.setAdapter(voiced.adapter);
	readAloud.dispose();
	assert.equal(voiced.voiceListeners.size, 0, 'dispose removes the voice listener');
});

test('the trigger is not rendered without a voice or a segment; pressed toggles in place', () => {
	assert.equal(triggerView(undefined, null), null, 'outside a provider');

	const silent = createReadAloud(mockAdapter(false).adapter);
	silent.register(entry('a', 'Text.'));
	assert.equal(triggerView(silent.getState(), null), null, 'no German voice');
	silent.dispose();

	const mock = mockAdapter(true);
	const readAloud = createReadAloud(mock.adapter);
	assert.equal(triggerView(readAloud.getState(), null), null, 'no segment yet');
	readAloud.register(entry('page', 'Seite.'));
	assert.equal(triggerView(readAloud.getState(), 'scope-1'), null, 'no segment in this scope');
	assert.deepEqual(triggerView(readAloud.getState(), null), { pressed: false });

	readAloud.register(entry('card', 'Karte.', 'scope-1'));
	readAloud.toggle('scope-1');
	assert.deepEqual(triggerView(readAloud.getState(), 'scope-1'), { pressed: true });
	// The page trigger pauses any speech (toggle(null)), so it shows pause too.
	assert.deepEqual(triggerView(readAloud.getState(), null), { pressed: true }, 'page trigger');
	assert.equal(triggerView(readAloud.getState(), 'scope-2'), null, 'empty scope stays hidden');
	readAloud.toggle('scope-1');
	assert.deepEqual(triggerView(readAloud.getState(), 'scope-1'), { pressed: false });
	readAloud.dispose();
});

test('speech rejects network voices and checks for a local voice before each segment', (t) => {
	const network = { lang: 'de-DE', localService: false };
	const local = { lang: 'de-AT', localService: true };
	let voices = [network];
	const played: SpeechSynthesisUtterance[] = [];
	const synth = {
		getVoices: () => voices,
		cancel() {},
		speak: (utterance: SpeechSynthesisUtterance) => played.push(utterance)
	};
	class Utterance {}

	for (const [key, value] of Object.entries({
		window: { speechSynthesis: synth },
		SpeechSynthesisUtterance: Utterance
	})) {
		const original = Object.getOwnPropertyDescriptor(globalThis, key);
		Object.defineProperty(globalThis, key, { configurable: true, value });
		t.after(() => {
			if (original) Object.defineProperty(globalThis, key, original);
			else Reflect.deleteProperty(globalThis, key);
		});
	}

	const adapter = createBrowserSpeechAdapter();
	assert.ok(adapter);
	const segments = [
		{ id: 'one', text: 'Erster Satz.', lang: 'de-DE' },
		{ id: 'two', text: 'Zweiter Satz.', lang: 'de-DE' }
	];
	const errors: string[] = [];
	const options: SpeakOptions = {
		from: 0,
		onSegment() {},
		onEnd: () => assert.fail('speech must stop when the local voice disappears'),
		onError: (reason) => errors.push(reason)
	};

	assert.equal(adapter.hasVoice('de-DE'), false);
	adapter.speak(segments, options);
	assert.equal(played.length, 0);

	voices = [network, local];
	assert.equal(adapter.hasVoice('de-DE'), true);
	adapter.speak(segments, options);
	assert.equal(played[0].voice, local);

	voices = [network];
	played[0].onend?.(new Event('end') as SpeechSynthesisEvent);
	assert.equal(played.length, 1);
	assert.deepEqual(errors, ['voice-unavailable', 'voice-unavailable']);
});
