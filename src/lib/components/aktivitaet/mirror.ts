import {
	evidenceAttemptId,
	EVIDENCE_LEVELS,
	effectiveResult,
	sameCourse
} from '../../api/types.js';
import type {
	ActivityMirrorSnapshot,
	ApiMode,
	CheckResult,
	CourseRef,
	EvidenceLevel,
	LearningEvidence
} from '../../api/types.js';
import type { ActivityConcept } from '../../content/types.js';
import { tutorialChecks, tutorials } from '../../content/tutorials.js';
import { exercises } from '../../content/uebungen.js';

/** Delayed recall and transfer both require a full day between independent successes. */
export const DELAYED_MASTERY_GAP_MS = 24 * 60 * 60 * 1000;

type Practice = Omit<
	ActivityMirrorSnapshot['recentPractice'][number],
	'result' | 'evidenceLevel'
> & {
	result: string;
	evidenceLevel?: string;
};
type MirrorInput = Omit<ActivityMirrorSnapshot, 'recentPractice'> & {
	recentPractice: readonly Practice[];
};
export type LiveObservation = Pick<LearningEvidence, 'learningGoalId' | 'taskId' | 'recordedAt'> &
	Partial<Pick<LearningEvidence, 'kind' | 'helpLevel'>> & { result: string };
type ConceptStatus = ActivityConcept['status'] | 'eingereicht_ungeprueft';

function isEvidenceLevel(value: unknown): value is EvidenceLevel {
	return EVIDENCE_LEVELS.some((level) => level === value);
}

/** The result a practice entry stands for: a sent evidence level wins over the legacy result. */
function practiceResult(practice: Practice): string {
	return isEvidenceLevel(practice.evidenceLevel)
		? effectiveResult(practice.result as CheckResult, practice.evidenceLevel)
		: practice.result;
}

/** Help is known only when the API sends it; an unknown level is never read as "no help". */
function helpOf(item: LiveObservation): 'none' | 'some' | 'unknown' {
	if (typeof item.helpLevel !== 'number') return 'unknown';
	return item.helpLevel > 0 ? 'some' : 'none';
}

function goalsForPractice(course: CourseRef, practice: Practice): readonly string[] {
	if (practice.kind === 'exercise') {
		const goals =
			exercises.find(({ task }) => sameCourse(task, course) && task.taskId === practice.itemId)
				?.learningGoalIds ?? [];
		return goals.length === 1 ? goals : [];
	}
	const checks = tutorialChecks.filter(
		(check) => sameCourse(check.course, course) && check.tutorialId === practice.itemId
	);
	const goals = new Set(checks.map((check) => check.learningGoalId ?? check.checkId));
	// An attempt without a check ID can only be attributed if the tutorial has one goal.
	return goals.size === 1 ? [...goals] : [];
}

export function conceptEvidence(snapshots: readonly MirrorInput[]): LiveObservation[] {
	return snapshots.flatMap(({ course, recentPractice, evidence }) => {
		const byAttempt = new Map<string, LearningEvidence[]>();
		const unmatched = new Set(evidence);
		for (const item of evidence) {
			const id = evidenceAttemptId(item, recentPractice);
			if (!id) continue;
			byAttempt.set(id, [...(byAttempt.get(id) ?? []), item]);
			unmatched.delete(item);
		}
		const observations = recentPractice.flatMap((practice): LiveObservation[] => {
			const linked = byAttempt.get(practice.id);
			const result = practiceResult(practice);
			if (linked)
				return linked.map((item) => {
					const verdict =
						item.evidenceLevel || item.result
							? effectiveResult(
									item.result ?? 'nicht_pruefbar_oder_alternativweg',
									item.evidenceLevel
								)
							: undefined;
					// Goal-specific diagnostics survive the aggregate verdict. A success still needs
					// a correct attempt, including for legacy evidence without its own verdict.
					return {
						...item,
						result: verdict === undefined || verdict === 'korrekt' ? result : verdict
					};
				});
			return goalsForPractice(course, practice).map((learningGoalId) => ({
				learningGoalId,
				taskId: practice.itemId,
				recordedAt: practice.recordedAt,
				result
			}));
		});
		for (const item of unmatched) {
			const result = effectiveResult(
				item.result ?? 'nicht_pruefbar_oder_alternativweg',
				item.evidenceLevel
			);
			observations.push({ ...item, result });
		}
		return observations;
	});
}

export function resolveConceptStatus(
	concept: Pick<ActivityConcept, 'learningGoalId' | 'status'>,
	liveEvidence: readonly LiveObservation[],
	mode: ApiMode
): ConceptStatus {
	const observations = liveEvidence
		.filter((item) => item.learningGoalId === concept.learningGoalId)
		.sort((left, right) => Date.parse(right.recordedAt) - Date.parse(left.recordedAt));
	const [latest, ...earlier] = observations;
	if (!latest) return mode === 'mock' ? concept.status : 'noch_zu_wenig_gesehen';
	const help = helpOf(latest);
	switch (latest.result) {
		case 'falsch':
			return 'nicht_gekonnt';
		case 'teilweise':
			if (help === 'unknown') return 'eingereicht_ungeprueft';
			return help === 'some' ? 'mit_hilfe_gelungen' : 'teilweise_gelungen';
		case 'nicht_pruefbar_oder_alternativweg':
			return 'eingereicht_ungeprueft';
		case 'korrekt': {
			// A correct answer after a hint, or without a known help level, is never mastery.
			if (help === 'unknown') return 'eingereicht_ungeprueft';
			if (help === 'some') return 'mit_hilfe_gelungen';
			const priorIndependentSuccess = earlier.some(
				(item) =>
					item.result === 'korrekt' &&
					helpOf(item) === 'none' &&
					Date.parse(latest.recordedAt) - Date.parse(item.recordedAt) >= DELAYED_MASTERY_GAP_MS
			);
			if (!priorIndependentSuccess) return 'einmal_gelungen';
			const newTask = earlier.every((item) => item.taskId !== latest.taskId);
			return latest.kind === 'transfer' && newTask ? 'übertragbar' : 'beherrscht';
		}
		default:
			return 'eingereicht_ungeprueft';
	}
}

export interface CalendarPoint {
	/** `YYYY-MM-DD` */
	date: string;
	kind: 'planned' | 'practiced';
	labels: readonly string[];
}

/** Every course the app records practice in, so the mirror sees exercises from all of them. */
export function practiceCourses(base: CourseRef): CourseRef[] {
	const all = [
		base,
		...exercises.map((exercise) => exercise.task),
		...tutorials.map((t) => t.course)
	];
	const unique = new Map(
		all.map((course) => [`${course.courseId}@${course.courseVersion}`, course])
	);
	return [...unique.values()].map(({ courseId, courseVersion }) => ({ courseId, courseVersion }));
}

/** Local calendar date as YYYY-MM-DD, the format of the seed's monthly points. */
export function localDate(value: Date | string): string {
	const date = typeof value === 'string' ? new Date(value) : value;
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${date.getFullYear()}-${month}-${day}`;
}
