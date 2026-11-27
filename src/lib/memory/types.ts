import type { TaskRef } from '../api/types.js';

export interface ScreenContext {
	route: string;
	topic?: string;
	sectionId?: string;
	sectionTitle?: string;
	courseId?: string;
	taskRef?: TaskRef;
	tutorialId?: string;
	momentId?: string;
	formulaId?: string;
	formulaLatex?: string;
	termId?: string;
	termLabel?: string;
	exerciseState?: { answerSelected?: string; confidence?: number; revealed?: boolean };
	media?: { kind: 'youtube' | 'audio'; id: string; title: string; chapter?: string };
	sketchSummary?: string;
	isIndependentProbe: boolean;
	updatedAt: number;
}

export type ScreenContextInput = Omit<ScreenContext, 'updatedAt' | 'isIndependentProbe'> & {
	isIndependentProbe?: boolean;
};

export type LearningContentKind = 'essay' | 'video' | 'exercise' | 'explanation' | 'audio';

export interface ContentVisit {
	kind: LearningContentKind;
	route: string;
	contentId?: string;
	topic?: string;
	title?: string;
	depth?: number;
	isIndependentProbe?: boolean;
}

export interface HistoryEntry extends Omit<ContentVisit, 'depth' | 'isIndependentProbe'> {
	id: string;
	lastVisitedAt: number;
	visits: number;
	depth: number;
}

export interface DwellStat {
	id: string;
	route: string;
	activeSeconds: number;
}

export type HomeSignal = 'keep' | 'dismiss' | 'open';

export interface HomeSignalEntry {
	topicId: string;
	signal: HomeSignal;
	recordedAt: number;
}

export interface InferredInterest {
	topicId: string;
	score: number;
}

export interface NoteInput {
	kind: 'note' | 'question';
	text: string;
	route: string;
	topic?: string;
	sectionTitle?: string;
	termId?: string;
}

export interface SavedNote extends NoteInput {
	id: string;
	createdAt: number;
}

export interface LearningMemorySnapshot {
	recentHistory: HistoryEntry[];
	dwellStats: DwellStat[];
	inferredInterests: InferredInterest[];
	savedNotesAndQuestions: SavedNote[];
	homeSignals: HomeSignalEntry[];
	excludedInterestTopics: string[];
}

export interface AgentContextSnapshot {
	visibleScreen: ScreenContext;
	recentHistory: HistoryEntry[];
	dwellStats: DwellStat[];
	inferredInterests: InferredInterest[];
	savedNotesAndQuestions: SavedNote[];
	capturedAt: number;
}
