/*
 * The podcast player as a pure model (AudioStage recipe, art direction §3.5): the timeline of an
 * episode, the dot matrix that is its scrubbable time axis, and a playback controller with an
 * injected clock. No audio file exists yet, so playback walks the timeline in real time. Relative
 * imports keep the file loadable in Node for player.test.ts.
 */
import type { PodcastEpisode } from '../../content/types.js';

export interface TimedSegment {
	index: number;
	title: string;
	script: string;
	start: number;
	end: number;
	listenerPrompt?: string;
	pauseSeconds: number;
}

/** Spoken German runs at roughly 150 words per minute; used only when the content gives no times. */
const WORDS_PER_SECOND = 150 / 60;
/** A listener prompt without its own pause still gets a short moment to think. */
const DEFAULT_PAUSE_SECONDS = 5;

function words(text: string): number {
	return text.split(/\s+/).filter(Boolean).length;
}

function spokenSeconds(script: string): number {
	return Math.max(1, Math.round(words(script) / WORDS_PER_SECOND));
}

/** Start and end of every segment, from content times or, as a fallback, from script length. */
export function buildTimeline(episode: PodcastEpisode): {
	segments: TimedSegment[];
	duration: number;
} {
	const starts: number[] = [];
	let estimate = 0;
	for (const segment of episode.segments) {
		starts.push(segment.startSeconds ?? estimate);
		estimate = (segment.startSeconds ?? estimate) + spokenSeconds(segment.script);
	}
	const duration = Math.max(episode.durationSeconds ?? estimate, starts.at(-1) ?? 0);
	const segments = episode.segments.map((segment, index) => ({
		index,
		title: segment.title,
		script: segment.script,
		start: starts[index],
		end: starts[index + 1] ?? duration,
		listenerPrompt: segment.listenerPrompt,
		pauseSeconds: segment.listenerPrompt ? (segment.pauseSeconds ?? DEFAULT_PAUSE_SECONDS) : 0
	}));
	return { segments, duration };
}

export function segmentAt(segments: readonly TimedSegment[], position: number): TimedSegment {
	return segments.findLast((segment) => segment.start <= position) ?? segments[0];
}

/** The paragraphs of a script, one per speaker turn. */
export function scriptParagraphs(script: string): string[] {
	return script
		.split(/\n{2,}/)
		.map((paragraph) => paragraph.trim())
		.filter(Boolean);
}

/**
 * The paragraph being spoken at `position`: the segment's time is shared by word count, so a
 * long turn holds the highlight longer than a short one.
 */
export function paragraphAt(segment: TimedSegment, position: number): number {
	const parts = scriptParagraphs(segment.script);
	if (parts.length <= 1) return 0;
	const counts = parts.map(words);
	const total = counts.reduce((sum, count) => sum + count, 0);
	const share = Math.min(
		Math.max((position - segment.start) / Math.max(segment.end - segment.start, 1), 0),
		1
	);
	let reached = 0;
	for (let index = 0; index < counts.length; index += 1) {
		reached += counts[index] / total;
		if (share < reached) return index;
	}
	return counts.length - 1;
}

export function formatClock(seconds: number): string {
	const whole = Math.max(0, Math.floor(seconds));
	const minutes = Math.floor(whole / 60);
	return `${minutes}:${String(whole % 60).padStart(2, '0')}`;
}

export function spokenClock(seconds: number): string {
	const whole = Math.max(0, Math.floor(seconds));
	return `${Math.floor(whole / 60)} Minuten ${whole % 60} Sekunden`;
}

/* ------------------------------------------------------------------------------------------- *
 * The dot matrix: 44 columns × 12 rows of circles (DESIGN.md §3.3). One column is one time slice
 * of the whole episode. Played columns are full; the current column fills from the bottom, row
 * by row, so only it changes while playing. In a thinking pause the matrix freezes and draws ‖
 * in --text over it; the played part stays yellow.
 * ------------------------------------------------------------------------------------------- */

export const MATRIX_COLUMNS = 44;
export const MATRIX_ROWS = 12;

export interface MatrixFrame {
	/** Columns before the current one, all played. */
	played: number;
	/** Rows lit in the current column, from the bottom. */
	rows: number;
}

/** The frame at a position. Equal frames mean nothing on screen changes. */
export function matrixFrame(
	position: number,
	duration: number,
	columns = MATRIX_COLUMNS,
	rows = MATRIX_ROWS
): MatrixFrame {
	if (duration <= 0) return { played: 0, rows: 0 };
	const slices = (Math.min(Math.max(position, 0), duration) / duration) * columns;
	if (slices >= columns) return { played: columns, rows: 0 };
	const played = Math.floor(slices);
	return { played, rows: Math.floor((slices - played) * rows) };
}

/** The pause sign ‖ in squares: two bars, two columns wide, centred, a row of margin top and bottom. */
export function pauseSign(
	column: number,
	row: number,
	columns = MATRIX_COLUMNS,
	rows = MATRIX_ROWS
): boolean {
	const left = Math.floor(columns / 2) - 3;
	const inBars =
		column === left || column === left + 1 || column === left + 4 || column === left + 5;
	return inBars && row >= 2 && row <= rows - 3;
}

/**
 * The state of a cell. Without a pause: lit are the played columns and the filled part of the
 * current column. In a pause the cells of the sign are `'sign'`, drawn as full squares in --text
 * (white on ink), so ‖ reads on the played and the open part alike and never as played time.
 */
export function matrixCell(
	frame: MatrixFrame,
	column: number,
	row: number,
	paused = false,
	columns = MATRIX_COLUMNS,
	rows = MATRIX_ROWS
): boolean | 'sign' {
	if (paused && pauseSign(column, row, columns, rows)) return 'sign';
	return column < frame.played || (column === frame.played && row >= rows - frame.rows);
}

/** The start of a column: where scrubbing onto it lands. */
export function columnStart(column: number, duration: number, columns = MATRIX_COLUMNS): number {
	return (Math.min(Math.max(column, 0), columns) / columns) * duration;
}

/** Detents of the scrub axis: one per column boundary, from 0 to the end. */
export function columnDetents(duration: number, columns = MATRIX_COLUMNS): number[] {
	return Array.from({ length: columns + 1 }, (_, column) => columnStart(column, duration, columns));
}

/* ------------------------------------------------------------------------------------------- *
 * Playback. The clock ticks with 12 frames per second (`tick`, DESIGN.md §4.3); the interval
 * exists only while playing and is cleared on pause, at the end and on dispose.
 * ------------------------------------------------------------------------------------------- */

export const TICK_MS = 1000 / 12;

export interface Clock {
	now(): number;
	/** Calls `callback` every `ms` until the returned function is called. */
	every(ms: number, callback: () => void): () => void;
}

export const browserClock: Clock = {
	now: () => performance.now(),
	every(ms, callback) {
		const timer = setInterval(callback, ms);
		return () => clearInterval(timer);
	}
};

export interface PlayerState {
	position: number;
	playing: boolean;
	/** A thinking pause: the segment that asks and the seconds left. */
	thinking: { segment: number; remaining: number } | null;
	ended: boolean;
}

export interface Player {
	getState(): PlayerState;
	subscribe(listener: (state: PlayerState) => void): () => void;
	play(): void;
	pause(): void;
	/** Play, pause, or (in a thinking pause) go on. */
	toggle(): void;
	seek(seconds: number): void;
	endThinking(): void;
	/** Stops the clock for good; later calls do nothing. */
	dispose(): void;
	/** Open intervals; 0 whenever the player is not playing (for the leak test). */
	activeTimers(): number;
}

export function createPlayer(
	timeline: { segments: readonly TimedSegment[]; duration: number },
	clock: Clock = browserClock
): Player {
	let state: PlayerState = { position: 0, playing: false, thinking: null, ended: false };
	const listeners = new Set<(state: PlayerState) => void>();
	let stopTimer: (() => void) | null = null;
	let last = 0;
	let disposed = false;

	function set(next: Partial<PlayerState>) {
		state = { ...state, ...next };
		for (const listener of listeners) listener(state);
	}

	function stopClock() {
		stopTimer?.();
		stopTimer = null;
	}

	function startClock() {
		if (stopTimer || disposed) return;
		last = clock.now();
		stopTimer = clock.every(TICK_MS, tick);
	}

	/* A prompted segment that playback reaches by itself opens a short pause to think. */
	function promptCrossed(from: number, to: number): TimedSegment | undefined {
		return timeline.segments.find(
			(segment) => segment.listenerPrompt && segment.start > from && segment.start <= to
		);
	}

	function tick() {
		const now = clock.now();
		const elapsed = (now - last) / 1000;
		last = now;
		if (state.thinking) {
			const remaining = state.thinking.remaining - elapsed;
			if (remaining > 0) set({ thinking: { ...state.thinking, remaining } });
			else set({ thinking: null });
			return;
		}
		const next = Math.min(state.position + elapsed, timeline.duration);
		const prompt = promptCrossed(state.position, next);
		if (prompt) {
			set({
				position: prompt.start,
				thinking: { segment: prompt.index, remaining: prompt.pauseSeconds }
			});
			return;
		}
		if (next >= timeline.duration) {
			stopClock();
			set({ position: timeline.duration, playing: false, ended: true });
			return;
		}
		set({ position: next });
	}

	function play() {
		if (disposed) return;
		if (state.ended || state.position >= timeline.duration) set({ position: 0, ended: false });
		set({ playing: true });
		startClock();
	}

	function pause() {
		stopClock();
		if (state.playing) set({ playing: false });
	}

	return {
		getState: () => state,
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		play,
		pause,
		toggle() {
			if (state.thinking) set({ thinking: null });
			else if (state.playing) pause();
			else play();
		},
		seek(seconds) {
			if (disposed) return;
			set({
				position: Math.min(Math.max(seconds, 0), timeline.duration),
				thinking: null,
				ended: false
			});
			if (state.playing) last = clock.now();
		},
		endThinking() {
			if (state.thinking) set({ thinking: null });
		},
		dispose() {
			stopClock();
			disposed = true;
			listeners.clear();
			state = { ...state, playing: false, thinking: null };
		},
		activeTimers: () => (stopTimer ? 1 : 0)
	};
}
