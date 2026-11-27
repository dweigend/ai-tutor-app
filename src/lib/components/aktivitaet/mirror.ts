import type {
	ActivityMirrorSnapshot,
	CheckResult,
	CourseRef,
	EvidenceKind,
	LearningEvidence
} from '$lib/api/types';
import { exercises, tutorials, type ActivityMirrorSeed } from '$lib/content';

type HelpLevel = 0 | 1 | 2 | 3 | 4;
type SeedObservation = ActivityMirrorSeed['observations'][number];

/** One dated line in the evidence list, from the seed or recorded live through the API. */
export interface EvidenceRow {
	key: string;
	recordedAt: string;
	origin: 'seed' | 'live';
	kind: 'attempted' | 'seen' | 'solution-seen';
	title: string;
	outcome?: CheckResult | 'nicht_beurteilbar';
	helpLevel?: HelpLevel;
	confidenceBefore?: number;
	criterion?: string;
	evidenceKind?: EvidenceKind;
	transferDistance?: 'near' | 'far';
	elapsedSinceLearningDays?: number;
}

export interface CalendarPoint {
	/** `YYYY-MM-DD` */
	date: string;
	kind: 'planned' | 'practiced';
	labels: readonly string[];
}

export interface LiveEvidence {
	rows: EvidenceRow[];
	evidence: LearningEvidence[];
}

const SEEN_TITLE = { seen: 'Beispiel angesehen', 'solution-seen': 'Lösung angesehen' } as const;

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

function taskTitle(taskId: string, seed: ActivityMirrorSeed, attemptId?: string): string {
	const exercise = exercises.find((item) => item.task.taskId === taskId);
	if (exercise) return exercise.title;
	const concept = seed.concepts.find((item) => 'attemptId' in item && item.attemptId === attemptId);
	return concept?.label ?? taskId;
}

export function seedRows(seed: ActivityMirrorSeed): EvidenceRow[] {
	return seed.observations.map((observation: SeedObservation, index) => {
		if (observation.kind !== 'attempted') {
			return {
				key: `seed-${index}`,
				recordedAt: observation.recordedAt,
				origin: 'seed',
				kind: observation.kind,
				title: SEEN_TITLE[observation.kind]
			};
		}
		return {
			key: observation.attemptId,
			recordedAt: observation.recordedAt,
			origin: 'seed',
			kind: 'attempted',
			title: taskTitle(observation.task.taskId, seed, observation.attemptId),
			outcome: observation.outcome,
			helpLevel: observation.helpLevel,
			confidenceBefore: observation.confidenceBefore,
			criterion: observation.criterion,
			evidenceKind: observation.evidenceKind,
			transferDistance: observation.transferDistance,
			elapsedSinceLearningDays: observation.elapsedSinceLearningDays
		};
	});
}

function practiceTitle(
	practice: ActivityMirrorSnapshot['recentPractice'][number],
	seed: ActivityMirrorSeed
) {
	if (practice.kind === 'exercise') return taskTitle(practice.itemId, seed);
	const tutorial = tutorials.find((item) => item.id === practice.itemId);
	return tutorial ? `Erklärung · ${tutorial.title}` : practice.itemId;
}

/** Evidence names its attempt explicitly; older answers without `attemptId` fall back to the id prefix. */
function belongsTo(item: LearningEvidence, attemptId: string): boolean {
	if (item.attemptId !== undefined) return item.attemptId === attemptId;
	return item.id.startsWith(`${attemptId}:`);
}

/** Turns API snapshots into evidence rows, linked to their attempt by `attemptId`. */
export function liveEvidence(
	snapshots: readonly ActivityMirrorSnapshot[],
	seed: ActivityMirrorSeed
): LiveEvidence {
	const evidence = snapshots.flatMap((snapshot) => snapshot.evidence);
	const rows = snapshots.flatMap((snapshot) =>
		snapshot.recentPractice.map((practice): EvidenceRow => {
			const linked = evidence.find((item) => belongsTo(item, practice.id));
			return {
				key: `live-${practice.id}`,
				recordedAt: practice.recordedAt,
				origin: 'live',
				kind: 'attempted',
				title: practiceTitle(practice, seed),
				outcome: practice.result,
				helpLevel: linked?.helpLevel,
				evidenceKind: linked?.kind
			};
		})
	);
	return { rows, evidence };
}

export function newestFirst(rows: readonly EvidenceRow[]): EvidenceRow[] {
	return [...rows].sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
}

/** Local calendar date as YYYY-MM-DD, the format of the seed's monthly points. */
export function localDate(value: Date | string): string {
	const date = typeof value === 'string' ? new Date(value) : value;
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${date.getFullYear()}-${month}-${day}`;
}
