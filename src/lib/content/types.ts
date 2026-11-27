import type {
	CheckResult,
	CourseRef,
	EvidenceKind,
	ExerciseAttemptRequest,
	TaskRef,
	TutorScope,
	TutorInput,
	TutorMoveKind,
	TutorialCheckRequest
} from '../api/types.js';

export interface ContentSource {
	label: string;
	href?: string;
}

export interface MagazineIntro {
	/** The opener in the magazine index, at most 88 characters (DESIGN.md §10.1). */
	teaser: string;
	/** The full editorial introduction. */
	deck: string;
}

export interface MagazineEssay extends MagazineIntro {
	id: string;
	title: string;
	editorialStyle: 'zeit' | 'brand-eins' | 'economist';
	readingMinutes: number;
	sections: readonly { heading?: string; markdown: string }[];
	sources: readonly ContentSource[];
}

/*
 * Hermes essay schema (`essay` v0.3.0, konzept-interaktions-module.md §7.3). One Hermes section
 * becomes one ArticleSection in its original order; one paragraph is one speech segment. Optional
 * UI blocks (facts, figure) hang on a section and name the paragraph they follow.
 */

/** A source with a stable id; `[01]` is derived from the order of first mention. */
export interface EssaySource extends ContentSource {
	sourceId: string;
}

/** `complete`: the claim is extracted with its source. `limitation`: an extraction gap. */
export type EvidenceStatus = 'complete' | 'limitation';

/** One piece of evidence (Hermes `evidence_by_id`). Claims and limits quote the essay text. */
export interface Evidence {
	sourceId: string;
	/** Where in the source, e.g. `§3.2.1`; omitted when the essay does not say. */
	section?: string;
	/** A verbatim quote from the source; omitted until one is extracted. */
	quote?: string;
	claim: string;
	limitations?: string;
	status: EvidenceStatus;
}

export interface ArticleParagraph {
	/** DOM id: section id plus paragraph index (`lernstand-studien-p1`). */
	id: string;
	/** Plain text; inline code in backticks. No markers, links or Markdown blocks. */
	text: string;
	evidenceIds: readonly string[];
}

/** A placement anchor: the block follows this paragraph; without it, the section end. */
interface Anchored {
	after?: string;
}

/** "Auf einen Blick": at most four one-line cells (DESIGN.md §10.1), true values from the text. */
export interface ArticleFacts extends Anchored {
	cells: readonly { label: string; value: string }[];
}

/** One bar: `display` is the value as the text states it; omitted, the bar carries no number. */
export interface FigureBar {
	label: string;
	/** Consecutive bars of one group share a label under them. */
	group?: string;
	value: number;
	display?: string;
	/** Drawn solid; the other bars stay outlines. */
	emphasis?: boolean;
}

export interface FigureGraphNode {
	id: string;
	label: string;
	/** Position in the 320 × 200 plate. */
	x: number;
	y: number;
	/** Callout lines under the node, e.g. `richtig −3`. */
	notes?: readonly string[];
	emphasis?: boolean;
	/** Side of the square the words stand on. */
	side?: 'left' | 'right' | 'above' | 'below';
}

/** At most one figure per essay, only where the text states the numbers (konzept §4.4). */
export type FigureSpec = Anchored & {
	title: string;
	caption: string;
} & (
		| { kind: 'bars'; bars: readonly FigureBar[]; unit?: string }
		| {
				kind: 'graph';
				nodes: readonly FigureGraphNode[];
				edges: readonly { from: string; to: string }[];
		  }
	);

export interface ArticleSection {
	id: string;
	/** Hermes `heading`; set as a `>>` lead line instead of a sub-heading. */
	heading?: string;
	/** An approved lead question that replaces the heading (textredaktion-v2.md §4). */
	lead?: string;
	kind?: 'opening' | 'text';
	paragraphs: readonly ArticleParagraph[];
	facts?: ArticleFacts;
	figure?: FigureSpec;
}

/** The Hermes part of an article: title and question kept apart (draft.title, outline.question). */
export interface HermesEssay {
	title: string;
	/** The lead question, ≤ 44 characters (textredaktion-v2.md §4). */
	question: string;
	/** Listening time (outline.estimated_minutes); reading time stays separate. */
	estimatedMinutes?: number;
	sections: readonly ArticleSection[];
	sources: readonly EssaySource[];
	evidenceById: Readonly<Record<string, Evidence>>;
}

export interface PodcastEpisode extends MagazineIntro {
	id: string;
	title: string;
	durationSeconds?: number;
	audioUrl?: string;
	segments: readonly {
		title: string;
		script: string;
		startSeconds?: number;
		listenerPrompt?: string;
		pauseSeconds?: number;
	}[];
	sources: readonly ContentSource[];
}

export interface DelegationBoundary {
	learner: readonly string[];
	tutorMay: readonly string[];
}

export type DiagnosisTrigger =
	| { kind: 'text'; accepted: readonly string[] }
	| { kind: 'contains'; phrases: readonly [string, ...string[]] }
	| { kind: 'input'; inputKind: TutorInput['kind'] };

export type ScriptedTutorMove =
	{ move: 'warten' } | { move: Exclude<TutorMoveKind, 'warten'>; text: string };

// A diagnosis can override the response and following step for the incoming turn.
export interface SocraticStep {
	id: string;
	prompt: ScriptedTutorMove;
	quickReplies?: readonly { id: string; label: string; input: TutorInput }[];
	diagnoses?: readonly {
		id: string;
		trigger: DiagnosisTrigger;
		reply: ScriptedTutorMove;
		nextStepId?: string;
	}[];
	nextStepId?: string;
}

export type TutorScenario = TutorScope & {
	id: string;
	title: string;
	setup: string;
	delegation: DelegationBoundary;
	steps: readonly [SocraticStep, ...SocraticStep[]];
	parallelExample?: Extract<ScriptedTutorMove, { text: string }>;
	whiteboardPrompt?: Extract<ScriptedTutorMove, { text: string }>;
};

type CheckPrompt =
	| { answerKind: 'text' }
	| {
			answerKind: 'choice';
			options: readonly { id: string; label: string }[];
			multiple?: boolean;
	  };

export type TutorialCheck = CheckPrompt & { id: string; prompt: string };

export interface NumberRange {
	min: number;
	max: number;
	step: number;
}

export type TutorialLab =
	| {
			kind: 'softmax-attention';
			logits: readonly [number, ...number[]];
			scaling: { enabled: boolean; keyDimension: number; range: NumberRange };
			sampling: { temperature: number; range: NumberRange; draws?: number; seed?: number };
	  }
	| {
			kind: 'backpropagation';
			inputs: { a: number; b: number; c: number };
			inputRange: NumberRange;
			squareAsProduct: boolean;
			activeEdges: { left: boolean; right: boolean };
			accumulation: 'add' | 'overwrite';
			finiteDifference: { h: number; exponentRange: NumberRange };
	  };

export type TutorialBlock = { id: string } & (
	| { kind: 'explanation' | 'worked-example'; markdown: string; beginnerOnly?: boolean }
	| {
			kind: 'prediction';
			check: TutorialCheck;
			reasoningPrompt?: string;
			askConfidence?: boolean;
			revealMarkdown: string;
	  }
	| { kind: 'lab'; config: TutorialLab; requiresPredictionId?: string }
	| { kind: 'micro-quiz'; checks: readonly [TutorialCheck, ...TutorialCheck[]] }
);

export interface InteractiveTutorial {
	id: string;
	course: CourseRef;
	title: string;
	summary: string;
	minutes: readonly [minimum: number, maximum: number];
	steps: readonly { id: string; title: string; blocks: readonly TutorialBlock[] }[];
	sources: readonly ContentSource[];
}

export type ExerciseFormat =
	| 'quick-challenge'
	| 'retrieval'
	| 'plausible-but-wrong'
	| 'contrast-lab'
	| 'deep-dive'
	| 'independent-probe';

type ExercisePrompt =
	| CheckPrompt
	| { answerKind: 'code'; starterCode: string; language: string }
	| { answerKind: 'order'; items: readonly { id: string; label: string }[] }
	| { answerKind: 'whiteboard' };

/** One fact cell on a stage: label (Mono 11) over value (Mono 17), each on one line. */
export interface StageFact {
	label: string;
	value: string;
}

/**
 * The facts of a stage step (textredaktion-v2.md §0): at most four cells, or a pair A/B.
 * `code` is a pair of short programs side by side (1.2), shown line by line.
 */
export type StageFacts =
	| { kind: 'cells'; cells: readonly StageFact[] }
	| {
			kind: 'pair';
			sides: readonly [
				{ key: string; label: string; value: string },
				{ key: string; label: string; value: string }
			];
	  }
	| {
			kind: 'code';
			sides: readonly [{ key: string; code: string }, { key: string; code: string }];
	  };

/**
 * The one instrument of a step: choice (Raster), digits (DigitPad), lines (LinePick, local),
 * paper (work off screen, key "Weiter"), sketch (hand-over to the whiteboard), spectrum
 * (two-pole Fader for a yes/no statement, never together with the confidence strip).
 */
export type StageInstrument =
	| {
			kind: 'choice';
			layout: 'grid' | 'flip' | 'rows';
			/**
			 * Voice of the options; it follows the content, not the layout: `value` for program
			 * output and numbers (Mono 500), `sentence` for statements (Archivo 400). Defaults to
			 * `sentence` for rows and `value` for grid and flip.
			 */
			voice?: 'value' | 'sentence';
			/**
			 * Stage labels per option id (textredaktion-v2.md §1). The stock labels in `response`
			 * stay until David approves the changes of §6; the stage shows the short form.
			 */
			labels?: Readonly<Record<string, string>>;
	  }
	| { kind: 'digits'; decimals: number; signed?: boolean; unit?: string }
	| { kind: 'lines'; code: string; max: number }
	| { kind: 'paper' }
	| { kind: 'sketch' }
	| { kind: 'spectrum' };

/**
 * One step of the stage (konzept §1.5, textredaktion-v2.md §1): four places — context, facts,
 * ask, more — plus the spoken version and the instrument. Text may use the raised/lowered
 * notation of `modules/core/rich-text.ts` (`10^{−6}`), never HTML.
 */
export interface StageStep {
	id: string;
	/** The matter in one line, ≤ 40 characters. Never the format. */
	context?: string;
	facts?: StageFacts;
	/** Exactly one task, ≤ 70 characters, ≤ 3 lines at 390px. */
	ask: string;
	/** Notes on how to do it, behind "Mehr". */
	more?: string;
	/** Spoken version of context, facts and question for ReadAloud. */
	spoken?: string;
	instrument: StageInstrument;
	/**
	 * A check the interface runs itself; it never reaches the API. `lines` lists the expected
	 * line ids of a LinePick (`z5`). Open point: the stock content has no rule for it yet.
	 */
	localCheck?: { kind: 'lines'; expected: readonly string[] };
}

/**
 * The short form of an exercise for the InteractionStage. Only the content layer changes; the
 * API types stay as they are. The last entry of `steps` sends the answer to the API, the steps
 * before it are local. `review` is an optional local step after the reveal.
 */
export interface ExerciseStage {
	correctFeedback?: string;
	/** List title without the format prefix (the format stands in the strip). */
	title?: string;
	steps: readonly [StageStep, ...StageStep[]];
	review?: StageStep;
}

export type ExerciseItem = {
	task: TaskRef;
	title: string;
	minutes: number;
	prompt: string;
	response: ExercisePrompt;
	askConfidence?: boolean;
	learningGoalIds: readonly string[];
	sources?: readonly ContentSource[];
	/** Optional stage form; without it the stage falls back to `prompt` as one step. */
	stage?: ExerciseStage;
} & (
	| { format: Exclude<ExerciseFormat, 'plausible-but-wrong'> }
	| {
			format: 'plausible-but-wrong';
			modelAnswer: string;
			passingExample: string;
			counterexamplePrompt: string;
			explanationPrompt: string;
	  }
);

type PracticeObservation =
	| { kind: 'seen' | 'solution-seen'; recordedAt: string }
	| {
			kind: 'attempted';
			attemptId: string;
			task: TaskRef;
			recordedAt: string;
			outcome: CheckResult | 'nicht_beurteilbar';
			helpLevel: 0 | 1 | 2 | 3 | 4;
			confidenceBefore?: number;
			criterion?: string;
			evidenceRef?: string;
			evidenceKind?: EvidenceKind;
			priorModelExposure?: boolean;
			elapsedSinceLearningDays?: number;
			transferDistance?: 'near' | 'far';
	  };

export type ActivityConcept = { conceptId: string; learningGoalId: string; label: string } & (
	| { status: 'noch_zu_wenig_gesehen'; nextPractice?: string }
	| {
			status:
				| 'einmal_gelungen'
				| 'teilweise_gelungen'
				| 'nicht_gekonnt'
				| 'mit_hilfe_gelungen'
				| 'wiederholt_gelungen'
				| 'beherrscht'
				| 'übertragbar';
			attemptId: string;
			criterion: string;
			nextPractice?: string;
	  }
);

export interface ActivityMirrorSeed {
	course: CourseRef;
	concepts: readonly ActivityConcept[];
	observations: readonly PracticeObservation[];
	monthlyPoints: readonly {
		month: `${number}-${number}`;
		points: readonly {
			date: string;
			kind: 'planned' | 'practiced';
			conceptIds: readonly string[];
		}[];
	}[];
}

// Curated answers for the mock are separate from the material shown before submission.
export interface CheckRule<Answer> {
	accepted: Answer;
	result: 'korrekt' | 'teilweise' | 'falsch';
	feedback: string;
}

export type TutorialCheckRule = CheckRule<TutorialCheckRequest['answer']>;
export type ExerciseCheckRule = CheckRule<ExerciseAttemptRequest['answer']>;
