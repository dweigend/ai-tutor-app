import { isId, isRecord, isRevision } from '../api/types.js';
import type {
	ContentVisit,
	HistoryEntry,
	HomeSignal,
	HomeSignalEntry,
	InferredInterest,
	LearningMemorySnapshot,
	NoteInput,
	SavedNote
} from './types.js';

export const LEARNING_MEMORY_STORAGE_KEY = 'tutor.learning-memory.v1';

type MemoryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type VisibilitySource = EventTarget & { readonly hidden: boolean };
type StoredVisit = HistoryEntry & { activeSeconds: number };

interface StoredMemory {
	version: 1;
	clearedAt?: number;
	clearId?: string;
	visits: StoredVisit[];
	notes: SavedNote[];
	homeSignals: HomeSignalEntry[];
	excludedInterestTopics: string[];
}

export interface LearningMemoryOptions {
	storage?: MemoryStorage | null;
	locks?: Pick<LockManager, 'request'>;
	now?: () => number;
	monotonicNow?: () => number;
}

export type MemoryEntryKind = 'history' | 'dwell' | 'note' | 'interest' | 'homeSignal';

const CONTENT_KINDS = ['essay', 'video', 'exercise', 'explanation', 'audio'];
const HOME_SIGNAL_SCORES: Record<HomeSignal, number> = { keep: 2, open: 1, dismiss: -3 };

function emptyMemory(): StoredMemory {
	return { version: 1, visits: [], notes: [], homeSignals: [], excludedInterestTopics: [] };
}

function browserStorage(): MemoryStorage | null {
	try {
		return typeof window === 'undefined' ? null : window.localStorage;
	} catch {
		// Private or sandboxed contexts may deny even access to the Storage object.
		return null;
	}
}

function entries<T>(value: unknown, parse: (entry: unknown) => T | undefined): T[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((entry: unknown) => {
		const parsed = parse(entry);
		return parsed === undefined ? [] : [parsed];
	});
}

function optionalText(value: unknown): string | undefined {
	return isId(value) ? value : undefined;
}

function parseVisit(value: unknown): StoredVisit | undefined {
	if (!isRecord(value)) return;
	const { id, route, kind, lastVisitedAt, visits, depth, activeSeconds } = value;
	if (!isId(id) || !isId(route) || !isContentKind(kind)) return;
	if (!isRevision(lastVisitedAt) || !isRevision(visits) || visits === 0) return;
	if (typeof depth !== 'number' || !(depth >= 0 && depth <= 1)) return;
	if (typeof activeSeconds !== 'number' || !Number.isFinite(activeSeconds) || activeSeconds < 0)
		return;
	return {
		id,
		route,
		kind,
		lastVisitedAt,
		visits,
		depth,
		activeSeconds,
		contentId: optionalText(value.contentId),
		title: optionalText(value.title),
		topic: optionalText(value.topic)
	};
}

function isContentKind(value: unknown): value is ContentVisit['kind'] {
	return typeof value === 'string' && CONTENT_KINDS.includes(value);
}

function parseNote(value: unknown): SavedNote | undefined {
	if (!isRecord(value)) return;
	const { id, kind, text, route, createdAt } = value;
	if (kind !== 'note' && kind !== 'question') return;
	if (!isId(id) || !isId(text) || !isId(route) || !isRevision(createdAt)) return;
	return {
		id,
		kind,
		text,
		route,
		createdAt,
		topic: optionalText(value.topic),
		sectionTitle: optionalText(value.sectionTitle),
		termId: optionalText(value.termId)
	};
}

function parseSignal(value: unknown): HomeSignalEntry | undefined {
	if (!isRecord(value)) return;
	const { topicId, signal, recordedAt } = value;
	if (signal !== 'keep' && signal !== 'dismiss' && signal !== 'open') return;
	if (!isId(topicId) || !isRevision(recordedAt)) return;
	return { topicId, signal, recordedAt };
}

function loadMemory(storage: MemoryStorage | null): StoredMemory {
	try {
		const raw = storage?.getItem(LEARNING_MEMORY_STORAGE_KEY);
		const data: unknown = raw == null ? null : JSON.parse(raw);
		if (!isRecord(data) || data.version !== 1) return emptyMemory();
		return {
			version: 1,
			clearedAt: isRevision(data.clearedAt) ? data.clearedAt : undefined,
			clearId: optionalText(data.clearId),
			visits: entries(data.visits, parseVisit),
			notes: entries(data.notes, parseNote),
			homeSignals: entries(data.homeSignals, parseSignal),
			excludedInterestTopics: entries(data.excludedInterestTopics, optionalText)
		};
	} catch {
		// An unreadable payload or unavailable storage starts an in-memory session.
		return emptyMemory();
	}
}

function progress(depth: number | undefined): number {
	return Number.isFinite(depth) ? Math.min(1, Math.max(0, depth ?? 0)) : 0;
}

function byId(left: string, right: string): number {
	return Number(left > right) - Number(left < right);
}

function interests(data: StoredMemory): InferredInterest[] {
	const scores = new Map(
		data.homeSignals.map(({ topicId, signal }) => [topicId, HOME_SIGNAL_SCORES[signal]])
	);
	for (const { topic, visits, activeSeconds } of data.visits) {
		if (topic) scores.set(topic, (scores.get(topic) ?? 0) + visits + activeSeconds / 60);
	}
	const excluded = new Set(data.excludedInterestTopics);
	return Array.from(scores, ([topicId, score]) => ({ topicId, score }))
		.filter(({ topicId, score }) => score > 0 && !excluded.has(topicId))
		.sort((left, right) => right.score - left.score || byId(left.topicId, right.topicId));
}

type Mutation = (data: StoredMemory) => void;

export class LearningMemoryStore {
	private storage: MemoryStorage | null;
	private readonly locks?: Pick<LockManager, 'request'>;
	private pending: Mutation[] = [];
	private readonly now: () => number;
	private readonly monotonicNow: () => number;
	private data: StoredMemory;
	private visible = typeof document === 'undefined' || !document.hidden;
	private active?: { id: string; clearId?: string };
	private activeSince?: number;

	constructor(options: LearningMemoryOptions = {}) {
		this.storage = options.storage === undefined ? browserStorage() : options.storage;
		this.locks =
			options.locks ?? (typeof window === 'undefined' ? undefined : window.navigator.locks);
		this.now = options.now ?? Date.now;
		this.monotonicNow = options.monotonicNow ?? options.now ?? (() => performance.now());
		this.data = loadMemory(this.storage);
	}

	private read(): StoredMemory {
		if (!this.storage) return this.data;
		const data = loadMemory(this.storage);
		for (const change of this.pending) change(data);
		return data;
	}

	// Keep the synchronous UI view current while browser tabs take turns committing changes.
	private update(change: Mutation): void {
		if (!this.storage) {
			change(this.data);
			return;
		}
		this.pending.push(change);
		if (this.pending.length > 1) return;
		const commit = () => {
			this.data = this.read();
			this.pending = [];
			try {
				this.storage?.setItem(LEARNING_MEMORY_STORAGE_KEY, JSON.stringify(this.data));
			} catch {
				this.storage = null;
			}
		};
		if (this.locks)
			void this.locks.request(LEARNING_MEMORY_STORAGE_KEY, commit).catch(() => {
				this.data = this.read();
				this.pending = [];
				this.storage = null;
			});
		else commit();
	}

	recordVisit(visit: ContentVisit): void {
		if (!isId(visit.route) || !isContentKind(visit.kind)) return;
		this.leaveContent();
		if (visit.isIndependentProbe) return;
		const { route, kind, contentId, topic, title, depth } = visit;
		const id = JSON.stringify([route, kind, contentId ?? null]);
		const lastVisitedAt = this.now();
		const { clearId } = this.read();
		this.active = { id, clearId };
		this.activeSince = this.visible ? this.monotonicNow() : undefined;
		this.update((data) => {
			if (data.clearId !== clearId) return;
			const previous = data.visits.find((entry) => entry.id === id);
			const visited = {
				id,
				route,
				kind,
				contentId,
				topic: topic ?? previous?.topic,
				title: title ?? previous?.title,
				lastVisitedAt,
				visits: (previous?.visits ?? 0) + 1,
				depth: Math.max(previous?.depth ?? 0, progress(depth)),
				activeSeconds: previous?.activeSeconds ?? 0
			};
			data.visits = data.visits.filter((entry) => entry.id !== id);
			data.visits.push(visited);
			if (visited.topic)
				data.excludedInterestTopics = data.excludedInterestTopics.filter(
					(t) => t !== visited.topic
				);
		});
	}

	recordDepth(depth: number): void {
		this.settleDwell(progress(depth));
	}

	leaveContent(): void {
		this.settleDwell();
		this.active = undefined;
		this.activeSince = undefined;
	}

	setVisible(visible: boolean): void {
		if (this.visible === visible) return;
		this.settleDwell();
		this.visible = visible;
		this.activeSince = visible && this.active ? this.monotonicNow() : undefined;
	}

	bindVisibility(source: VisibilitySource | undefined = globalThis.document): () => void {
		if (!source) return () => {};
		const sync = () => this.setVisible(!source.hidden);
		source.addEventListener('visibilitychange', sync);
		sync();
		return () => {
			source.removeEventListener('visibilitychange', sync);
			this.setVisible(false);
		};
	}

	private settleDwell(depth = 0): void {
		const active = this.active;
		if (!active) return;
		const now = this.monotonicNow();
		const elapsed = this.activeSince === undefined ? 0 : (now - this.activeSince) / 1000;
		const seconds = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
		if (this.activeSince !== undefined) this.activeSince = now;
		if (!seconds && !depth) return;
		this.update((data) => {
			const visit = data.visits.find((entry) => entry.id === active.id);
			if (data.clearId !== active.clearId || !visit) return;
			visit.depth = Math.max(visit.depth, depth);
			visit.activeSeconds += seconds;
		});
	}

	recordHomeSignal(topicId: string, signal: HomeSignal): (() => void) | undefined {
		if (!isId(topicId)) return;
		const now = this.now();
		let previous: HomeSignalEntry | undefined;
		let recordedAt: number;
		const { clearId } = this.read();
		this.update((data) => {
			if (clearId !== data.clearId) return;
			previous = data.homeSignals.find((entry) => entry.topicId === topicId);
			recordedAt = Math.max(now, (previous?.recordedAt ?? -1) + 1);
			data.homeSignals = data.homeSignals.filter((entry) => entry.topicId !== topicId);
			data.homeSignals.push({ topicId, signal, recordedAt });
			data.excludedInterestTopics = data.excludedInterestTopics.filter(
				(topic) => topic !== topicId
			);
		});
		if (signal === 'open') return;
		return () =>
			this.update((data) => {
				const latest = data.homeSignals.find((entry) => entry.topicId === topicId);
				if (
					data.clearId !== clearId ||
					!latest ||
					latest.recordedAt !== recordedAt ||
					latest.signal !== signal
				)
					return;
				data.homeSignals = data.homeSignals.filter((entry) => entry.topicId !== topicId);
				if (previous) data.homeSignals.push(previous);
			});
	}

	addNote(input: NoteInput): SavedNote | undefined {
		const note = parseNote({
			...input,
			text: input.text.trim(),
			id: crypto.randomUUID(),
			createdAt: this.now()
		});
		if (!note) return;
		const { clearId } = this.read();
		this.update((data) => {
			if (data.clearId === clearId) data.notes.unshift(note);
		});
		return { ...note };
	}

	deleteNote(id: string): void {
		this.deleteEntry('note', id);
	}

	deleteEntry(kind: MemoryEntryKind, id: string): void {
		this.settleDwell();
		if (kind === 'history' && this.active?.id === id) this.active = undefined;
		this.update((data) => {
			switch (kind) {
				case 'note':
					data.notes = data.notes.filter((entry) => entry.id !== id);
					break;
				case 'homeSignal':
					data.homeSignals = data.homeSignals.filter((entry) => entry.topicId !== id);
					break;
				case 'interest':
					data.homeSignals = data.homeSignals.filter((entry) => entry.topicId !== id);
					if (!data.excludedInterestTopics.includes(id)) data.excludedInterestTopics.push(id);
					break;
				case 'dwell': {
					const visit = data.visits.find((entry) => entry.id === id);
					if (visit) visit.activeSeconds = 0;
					break;
				}
				case 'history':
					data.visits = data.visits.filter((entry) => entry.id !== id);
			}
		});
	}

	exportSnapshot(): LearningMemorySnapshot {
		this.settleDwell();
		const data = this.read();
		const visits = data.visits.toSorted(
			(left, right) => right.lastVisitedAt - left.lastVisitedAt || byId(left.id, right.id)
		);
		return {
			recentHistory: visits.map(({ activeSeconds: _seconds, ...visit }) => visit),
			dwellStats: visits
				.filter(({ activeSeconds }) => activeSeconds > 0)
				.map(({ id, route, activeSeconds }) => ({ id, route, activeSeconds })),
			inferredInterests: interests(data),
			savedNotesAndQuestions: data.notes.map((entry) => ({ ...entry })),
			homeSignals: data.homeSignals.map((entry) => ({ ...entry })),
			excludedInterestTopics: [...data.excludedInterestTopics]
		};
	}

	clearAll(): void {
		this.active = undefined;
		this.activeSince = undefined;
		const clearedAt = this.now();
		const clearId = crypto.randomUUID();
		this.update((data) => Object.assign(data, emptyMemory(), { clearedAt, clearId }));
	}
}
