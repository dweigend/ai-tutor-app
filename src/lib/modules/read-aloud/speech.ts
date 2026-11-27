/**
 * Speech adapters for ReadAloud (ui/DESIGN.md §11 D2). The demo mode speaks with the browser's
 * speechSynthesis; a live adapter can later play server audio behind the same interface.
 */
export interface SpeechSegment {
	id: string;
	/** Plain words; icons are aria-hidden SVG and never part of a text (DESIGN.md §7.4). */
	text: string;
	lang: string;
}

export interface SpeakOptions {
	/** Index of the first segment to speak. */
	from: number;
	onSegment: (index: number, phase: 'start' | 'end') => void;
	onEnd: () => void;
	onError: (reason: string) => void;
}

export interface SpeechHandle {
	/** Ends speech at once and detaches every callback. Safe to call twice. */
	stop(): void;
}

export interface SpeechAdapter {
	hasVoice(lang: string): boolean;
	/** Voices load late in some browsers; returns the unsubscribe function. */
	onVoicesChanged(listener: () => void): () => void;
	speak(segments: readonly SpeechSegment[], options: SpeakOptions): SpeechHandle;
	dispose(): void;
}

/** Errors that mean "we cancelled it ourselves", not a failure to report. */
const OWN_CANCEL = new Set(['interrupted', 'canceled']);

function normalizeLang(lang: string): string {
	return lang.replace('_', '-').toLowerCase();
}

function findVoice(voices: SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | undefined {
	const wanted = normalizeLang(lang);
	const language = wanted.split('-')[0];
	const local = voices.filter((voice) => voice.localService === true);
	return (
		local.find((voice) => normalizeLang(voice.lang) === wanted) ??
		local.find((voice) => normalizeLang(voice.lang).split('-')[0] === language)
	);
}

/**
 * Browser adapter on `speechSynthesis`, one utterance per segment so progress is exact.
 * Returns null where the API is missing (server render, old browsers).
 */
export function createBrowserSpeechAdapter(): SpeechAdapter | null {
	if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
	if (typeof SpeechSynthesisUtterance === 'undefined') return null;
	const synth = window.speechSynthesis;
	let active: SpeechHandle | null = null;

	function speak(segments: readonly SpeechSegment[], options: SpeakOptions): SpeechHandle {
		active?.stop();
		let index = options.from;
		let stopped = false;
		let current: SpeechSynthesisUtterance | null = null;

		const detach = () => {
			if (!current) return;
			current.onend = null;
			current.onerror = null;
			current = null;
		};

		const next = () => {
			if (stopped) return;
			if (index >= segments.length) {
				stopped = true;
				detach();
				active = null;
				options.onEnd();
				return;
			}
			const position = index;
			const segment = segments[position];
			const voice = findVoice(synth.getVoices(), segment.lang);
			if (!voice) {
				stopped = true;
				detach();
				active = null;
				options.onError('voice-unavailable');
				return;
			}
			const utterance = new SpeechSynthesisUtterance(segment.text);
			utterance.lang = segment.lang;
			utterance.voice = voice;
			utterance.onend = () => {
				if (stopped) return;
				options.onSegment(position, 'end');
				index = position + 1;
				next();
			};
			utterance.onerror = (event) => {
				if (stopped || OWN_CANCEL.has(event.error)) return;
				stopped = true;
				detach();
				options.onError(event.error);
			};
			// Keep a reference: some engines drop callbacks of collected utterances.
			current = utterance;
			synth.speak(utterance);
			options.onSegment(position, 'start');
		};

		const handle: SpeechHandle = {
			stop() {
				if (stopped) return;
				stopped = true;
				detach();
				synth.cancel();
				if (active === handle) active = null;
			}
		};
		synth.cancel();
		active = handle;
		next();
		return handle;
	}

	return {
		hasVoice: (lang) => findVoice(synth.getVoices(), lang) !== undefined,
		onVoicesChanged(listener) {
			synth.addEventListener('voiceschanged', listener);
			return () => synth.removeEventListener('voiceschanged', listener);
		},
		speak,
		dispose: () => active?.stop()
	};
}
