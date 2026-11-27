import type { SpeechAdapter, SpeechHandle, SpeechSegment } from './speech.js';

/**
 * ReadAloud state without Svelte, so the rules are testable in Node (ui/DESIGN.md §11 D2).
 * Two states only: idle (speaker) and speaking (pause). Pausing remembers the segment;
 * the next start resumes there. Nothing ever starts on its own (DESIGN.md §11.7).
 */
export type ReadAloudStatus = 'idle' | 'speaking';

/** Language of every scope unless it names another one. */
export const DEFAULT_LANG = 'de-DE';

const SPACE_RUN = /\s+/g;

/** The text a voice gets: markup leaves line breaks and indents behind, a voice needs none. */
function spokenWords(text: string): string {
	return text.replace(SPACE_RUN, ' ').trim();
}

export interface SegmentEntry {
	id: string;
	/** Id of the enclosing ReadAloud.Scope, or null outside any scope. */
	scope: string | null;
	lang: string;
	/** Read lazily at start, so the segment speaks what is on screen now. */
	text: () => string;
	/** Used to order segments as they stand in the document. */
	node?: Node;
}

export interface ReadAloudState {
	status: ReadAloudStatus;
	/** Scope that is speaking; null means the whole screen. */
	scope: string | null;
	activeId: string | null;
	/** True once the adapter has a voice for DEFAULT_LANG. */
	available: boolean;
	/** Registered segments in registration order. */
	segments: readonly { id: string; scope: string | null }[];
}

export interface ReadAloudController {
	register(entry: SegmentEntry): () => void;
	/** Start, or pause if this trigger's speech is running. scope null = the whole screen. */
	toggle(scope: string | null): void;
	stop(): void;
	setAdapter(adapter: SpeechAdapter | null): void;
	getState(): ReadAloudState;
	subscribe(listener: (state: ReadAloudState) => void): () => void;
	dispose(): void;
}

/** What a trigger shows: null renders nothing, otherwise the pressed state of the one button. */
export interface TriggerView {
	pressed: boolean;
}

/**
 * "Was nicht geht, steht nicht da" (DESIGN.md §7): without a German voice or without a segment in
 * the trigger's scope there is no button at all, not a disabled one. scope null = whole screen.
 */
export function triggerView(
	state: ReadAloudState | undefined,
	scope: string | null
): TriggerView | null {
	if (!state?.available) return null;
	const inScope = state.segments.some((segment) => scope === null || segment.scope === scope);
	if (!inScope) return null;
	return { pressed: state.status === 'speaking' && (scope === null || state.scope === scope) };
}

function documentOrder(left: SegmentEntry, right: SegmentEntry): number {
	if (!left.node || !right.node) return 0;
	const position = left.node.compareDocumentPosition(right.node);
	if (position & 4) return -1; // Node.DOCUMENT_POSITION_FOLLOWING, without a DOM global
	if (position & 2) return 1; // Node.DOCUMENT_POSITION_PRECEDING
	return 0;
}

export function createReadAloud(initial: SpeechAdapter | null = null): ReadAloudController {
	const entries = new Map<string, SegmentEntry>();
	const listeners = new Set<(state: ReadAloudState) => void>();
	let adapter: SpeechAdapter | null = null;
	let stopVoices: (() => void) | undefined;
	let handle: SpeechHandle | undefined;
	let playlist: string[] = [];
	let resumeId: string | null = null;
	let state: ReadAloudState = {
		status: 'idle',
		scope: null,
		activeId: null,
		available: false,
		segments: []
	};

	function update(patch: Partial<ReadAloudState>) {
		state = { ...state, ...patch };
		for (const listener of listeners) listener(state);
	}

	function segmentList() {
		return [...entries.values()].map(({ id, scope }) => ({ id, scope }));
	}

	function halt() {
		handle?.stop();
		handle = undefined;
		playlist = [];
	}

	function pause() {
		resumeId = state.activeId;
		halt();
		update({ status: 'idle', activeId: null });
	}

	function stop() {
		resumeId = null;
		halt();
		update({ status: 'idle', activeId: null });
	}

	function collect(scope: string | null): SpeechSegment[] {
		const inScope = [...entries.values()].filter(
			(entry) => scope === null || entry.scope === scope
		);
		return inScope
			.sort(documentOrder)
			.map((entry) => ({ id: entry.id, text: spokenWords(entry.text()), lang: entry.lang }))
			.filter((segment) => segment.text.length > 0);
	}

	function start(scope: string | null) {
		halt();
		const segments = collect(scope);
		if (!adapter || !state.available || segments.length === 0) {
			update({ status: 'idle', activeId: null });
			return;
		}
		const resumeAt = segments.findIndex((segment) => segment.id === resumeId);
		resumeId = null;
		playlist = segments.map((segment) => segment.id);
		update({ status: 'speaking', scope, activeId: null });
		handle = adapter.speak(segments, {
			from: Math.max(resumeAt, 0),
			onSegment: (index, phase) => {
				if (phase === 'start') update({ activeId: segments[index].id });
			},
			onEnd: stop,
			onError: stop
		});
	}

	function refreshVoices() {
		update({ available: adapter?.hasVoice(DEFAULT_LANG) ?? false });
	}

	const controller: ReadAloudController = {
		register(entry) {
			entries.set(entry.id, entry);
			update({ segments: segmentList() });
			return () => {
				entries.delete(entry.id);
				if (resumeId === entry.id) resumeId = null;
				// A page or block that leaves the screen ends its speech (route change, unmount).
				if (playlist.includes(entry.id)) stop();
				update({ segments: segmentList() });
			};
		},
		toggle(scope) {
			const mine = scope === null || state.scope === scope;
			if (state.status === 'speaking' && mine) {
				pause();
				return;
			}
			start(scope);
		},
		stop,
		setAdapter(next) {
			if (next === adapter) return;
			stop();
			stopVoices?.();
			adapter = next;
			stopVoices = next?.onVoicesChanged(refreshVoices);
			refreshVoices();
		},
		getState: () => state,
		subscribe(listener) {
			listeners.add(listener);
			listener(state);
			return () => listeners.delete(listener);
		},
		dispose() {
			stop();
			stopVoices?.();
			stopVoices = undefined;
			listeners.clear();
			entries.clear();
		}
	};
	controller.setAdapter(initial);
	return controller;
}
