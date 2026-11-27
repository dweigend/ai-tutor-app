import type { LearningMemoryStore } from './memory-store.js';
import { INDEPENDENT_PROBE_HELP } from './screen-context.js';
import type { AgentContextSnapshot, SavedNote, ScreenContext } from './types.js';

const RECENT_LIMIT = 8;
const INTEREST_LIMIT = 6;
const NOTE_LIMIT = 3;
const FIELD_LIMIT = 240;
const LONG_TEXT_LIMIT = 600;
// A visit id encodes route, kind and content id in the same string.
const VISIT_ID_LIMIT = 1_500;

function clip(value: string | undefined, limit = FIELD_LIMIT): string | undefined {
	return value?.slice(0, limit);
}

function boundedScreen(screen: ScreenContext): ScreenContext {
	const { route, updatedAt, isIndependentProbe } = screen;
	const base = { route: route.slice(0, FIELD_LIMIT), updatedAt, isIndependentProbe };
	if (isIndependentProbe) return base;

	const { taskRef, media, exerciseState } = screen;
	return {
		...base,
		topic: clip(screen.topic),
		sectionId: clip(screen.sectionId),
		sectionTitle: clip(screen.sectionTitle),
		courseId: clip(screen.courseId),
		taskRef: taskRef && {
			courseId: taskRef.courseId.slice(0, FIELD_LIMIT),
			courseVersion: taskRef.courseVersion.slice(0, FIELD_LIMIT),
			taskId: taskRef.taskId.slice(0, FIELD_LIMIT)
		},
		tutorialId: clip(screen.tutorialId),
		momentId: clip(screen.momentId),
		formulaId: clip(screen.formulaId),
		// A partial TeX expression could change the formula or become unparsable.
		formulaLatex:
			screen.formulaLatex && screen.formulaLatex.length <= LONG_TEXT_LIMIT
				? screen.formulaLatex
				: undefined,
		termId: clip(screen.termId),
		termLabel: clip(screen.termLabel),
		exerciseState: exerciseState && {
			answerSelected: clip(exerciseState.answerSelected),
			confidence: Number.isFinite(exerciseState.confidence) ? exerciseState.confidence : undefined,
			revealed: exerciseState.revealed
		},
		media: media && {
			kind: media.kind,
			id: media.id.slice(0, FIELD_LIMIT),
			title: media.title.slice(0, FIELD_LIMIT),
			chapter: clip(media.chapter)
		},
		sketchSummary: clip(screen.sketchSummary, LONG_TEXT_LIMIT)
	};
}

function relevance(screen: ScreenContext, note: SavedNote): number {
	const sameRoute = note.route === screen.route;
	const sameTopic = screen.topic !== undefined && note.topic === screen.topic;
	const sameTerm = screen.termId !== undefined && note.termId === screen.termId;
	const sameSection =
		screen.sectionTitle !== undefined && note.sectionTitle === screen.sectionTitle;
	return (
		8 * Number(sameTerm) +
		4 * Number(sameRoute && sameSection) +
		2 * Number(sameTopic) +
		Number(sameRoute)
	);
}

export function findRelevantNotes(screen: ScreenContext, notes: readonly SavedNote[]): SavedNote[] {
	if (screen.isIndependentProbe) return [];
	const ranked = notes
		.map((note) => ({ note, score: relevance(screen, note) }))
		.sort((left, right) => right.score - left.score || right.note.createdAt - left.note.createdAt)
		.map(({ note }) => ({ ...note }));
	// Reserve a slot for the latest note from another page even when this page has many matches.
	const recent = notes
		.filter((note) => note.route !== screen.route && note.kind === 'note')
		.toSorted((a, b) => b.createdAt - a.createdAt)[0];
	const selected = ranked.slice(0, NOTE_LIMIT);
	if (recent && !selected.some((note) => note.id === recent.id))
		selected[NOTE_LIMIT - 1] = { ...recent };
	return selected;
}

function screenContentId(screen: ScreenContext): string | undefined {
	return screen.media?.id ?? screen.tutorialId ?? screen.taskRef?.taskId;
}

function visitRelevance(
	screen: ScreenContext,
	visit: AgentContextSnapshot['recentHistory'][number]
): number {
	if (visit.route !== screen.route) return 0;
	return visit.contentId === screenContentId(screen) ? 2 : 1;
}

export function buildAgentContextSnapshot(
	screen: ScreenContext,
	memory: LearningMemoryStore,
	capturedAt = Date.now()
): AgentContextSnapshot {
	const visibleScreen = boundedScreen(screen);
	if (screen.isIndependentProbe) {
		return {
			visibleScreen,
			capturedAt,
			recentHistory: [],
			dwellStats: [],
			inferredInterests: [],
			savedNotesAndQuestions: []
		};
	}
	const data = memory.exportSnapshot();
	const recent = data.recentHistory
		.toSorted((left, right) => visitRelevance(screen, right) - visitRelevance(screen, left))
		.slice(0, RECENT_LIMIT);
	const included = new Set(recent.map(({ id }) => id));
	return {
		visibleScreen,
		capturedAt,
		recentHistory: recent.map((visit) => ({
			...visit,
			id: visit.id.slice(0, VISIT_ID_LIMIT),
			route: visit.route.slice(0, FIELD_LIMIT),
			contentId: clip(visit.contentId),
			topic: clip(visit.topic),
			title: clip(visit.title)
		})),
		dwellStats: data.dwellStats
			.filter(({ id }) => included.has(id))
			.map((stat) => ({
				...stat,
				id: stat.id.slice(0, VISIT_ID_LIMIT),
				route: stat.route.slice(0, FIELD_LIMIT)
			})),
		inferredInterests: data.inferredInterests.slice(0, INTEREST_LIMIT).map((interest) => ({
			...interest,
			topicId: interest.topicId.slice(0, FIELD_LIMIT)
		})),
		savedNotesAndQuestions: findRelevantNotes(screen, data.savedNotesAndQuestions).map((note) => ({
			...note,
			id: note.id.slice(0, FIELD_LIMIT),
			text: note.text.slice(0, LONG_TEXT_LIMIT),
			route: note.route.slice(0, FIELD_LIMIT),
			topic: clip(note.topic),
			sectionTitle: clip(note.sectionTitle),
			termId: clip(note.termId)
		}))
	};
}

const ATTENTION_TERMS = [
	[
		/^(q|query|queries)$/i,
		'Q steht für die Queries. Jede Query beschreibt, wonach die jeweilige Position in den anderen Tokens sucht.'
	],
	[
		/^(k|kt|key|keys|key-transpose|k-transpose|kᵀ)$/i,
		'Kᵀ ist die transponierte Key-Matrix. Das Produkt QKᵀ vergleicht jede Query mit jedem Key und ergibt einen Score pro Paar.'
	],
	[
		/^(scale|scaling|sqrt-dk|sqrt-d-k|√dₖ|dk|d_k|d-k|skalierung)$/i,
		'√dₖ ist die Wurzel aus der Dimension der Keys. Die Division hält die Skalarprodukte bei größeren Dimensionen in einer ähnlichen Größenordnung.'
	],
	[
		/^softmax$/i,
		'Softmax verwandelt die Scores jeder Query in Gewichte. Größere Scores erhalten mehr Gewicht, und die Gewichte einer Zeile summieren sich zu eins.'
	],
	[
		/^(v|value|values)$/i,
		'V steht für die Values. Die Attention-Gewichte bestimmen, wie stark jeder Value in die Ausgabe eingeht.'
	]
] as const;

function attentionExplanation(screen: ScreenContext): string | undefined {
	const termId = screen.termId ?? '';
	if (
		!/attention/i.test(screen.formulaId ?? '') &&
		!/attention/i.test(screen.tutorialId ?? '') &&
		!/attention/i.test(screen.formulaLatex ?? '') &&
		!/^attention[-:/]/i.test(termId)
	)
		return;
	if (!screen.termId) {
		return 'Attention vergleicht Queries und Keys. Die skalierten Scores werden zu Gewichten, mit denen Attention die Values mischt.';
	}
	const term = termId.replace(/^attention[-:/]/i, '');
	return ATTENTION_TERMS.find(
		([pattern]) => pattern.test(term) || pattern.test(screen.termLabel ?? '')
	)?.[1];
}

function currentDwell(snapshot: AgentContextSnapshot): number {
	const { visibleScreen: screen } = snapshot;
	const visits = snapshot.recentHistory.filter((visit) => visit.route === screen.route);
	const contentId = screenContentId(screen);
	// Several contents can share a route, for example chapters within a media library.
	const visit = visits.find((entry) => contentId !== undefined && entry.contentId === contentId);
	const fallback =
		visits.length === 1 && (!contentId || !visits[0].contentId) ? visits[0] : undefined;
	const target = visit ?? fallback;
	if (!target) return 0;
	return snapshot.dwellStats.find((entry) => entry.id === target.id)?.activeSeconds ?? 0;
}

function durationLabel(activeSeconds: number): string {
	const seconds = Math.floor(activeSeconds);
	if (seconds < 60) return `${seconds} ${seconds === 1 ? 'Sekunde' : 'Sekunden'}`;
	const minutes = Math.floor(seconds / 60);
	return `${minutes} ${minutes === 1 ? 'Minute' : 'Minuten'}`;
}

export function latestSavedNote(snapshot: AgentContextSnapshot): SavedNote | undefined {
	if (snapshot.visibleScreen.isIndependentProbe) return;
	const notes = snapshot.savedNotesAndQuestions.toSorted((a, b) => b.createdAt - a.createdAt);
	return notes.find((note) => note.kind === 'note') ?? notes[0];
}

export function contextualReference(
	snapshot: AgentContextSnapshot,
	quoteNote: boolean,
	recall = false
): string {
	const { visibleScreen: screen } = snapshot;
	if (screen.isIndependentProbe) return '';
	const parts: string[] = [];
	if (screen.sectionTitle) parts.push(`Du bist im Abschnitt „${screen.sectionTitle}“.`);
	if (screen.media) {
		const { title, chapter } = screen.media;
		parts.push(
			chapter ? `Du bist bei „${title}“, Kapitel „${chapter}“.` : `Du bist bei „${title}“.`
		);
	}
	if (screen.sketchSummary) parts.push(`Auf deiner Skizze sehe ich „${screen.sketchSummary}“.`);
	const term = screen.termLabel ?? screen.termId;
	if (term) parts.push(`Du hast „${term}“ ausgewählt.`);
	const seconds = currentDwell(snapshot);
	if (seconds >= 1) parts.push(`Hier warst du ${durationLabel(seconds)} aktiv.`);

	const note =
		recall || screen.route === '/' || screen.route === '/aktivitaet'
			? latestSavedNote(snapshot)
			: snapshot.savedNotesAndQuestions[0];
	if (note) {
		const label = note.kind === 'question' ? 'Frage' : 'Notiz';
		parts.push(
			quoteNote
				? `Du hattest diese ${label} gespeichert: „${note.text}“.`
				: `Du hast schon eine ${label} gespeichert.`
		);
	}
	return parts.join(' ');
}

function followUp(screen: ScreenContext): string {
	if (screen.termId) return 'Wo steckt der Term in der Formel?';
	if (screen.formulaId || screen.formulaLatex) return 'Welchen Teil der Formel schauen wir uns an?';
	if (screen.sketchSummary) return 'Was willst du an deiner Skizze prüfen?';
	if (screen.media) return 'Welche Stelle beschäftigt dich gerade?';
	if (screen.exerciseState || screen.taskRef) return 'Was wäre dein erster Schritt?';
	if (screen.sectionTitle) return 'Was ist hier noch unklar?';
	return 'Wo hakt’s gerade?';
}

export function buildContextualHelp(snapshot: AgentContextSnapshot): string {
	const screen = snapshot.visibleScreen;
	if (screen.isIndependentProbe) return INDEPENDENT_PROBE_HELP;
	// During a task, the existing tutor owns the next step and the delegation boundary.
	const explanation = screen.taskRef ? undefined : attentionExplanation(screen);
	return [contextualReference(snapshot, !screen.taskRef), explanation ?? followUp(screen)]
		.filter(Boolean)
		.join(' ');
}
