import { defaultFixtures } from '../api/defaultFixtures.js';
import type { MockFixtures } from '../api/mock.js';
import { sameCourse, sameTask } from '../api/types.js';
import { tutorScenarios } from './tutor.js';
import { tutorialChecks } from './tutorials.js';
import { exerciseChecks } from './uebungen.js';

export type * from './types.js';
export * from './aktivitaet.js';
export * from './magazin.js';
export * from './tutor.js';
export * from './tutorials.js';
export * from './uebungen.js';

// Editorial content wins on overlap. Demo entries without an editorial counterpart stay, so
// pages that still address the demo task keep working in mock mode.
export function buildEditorialMockFixtures(): MockFixtures {
	const scenarios = [
		...tutorScenarios,
		...defaultFixtures.scenarios.filter(
			(demo) => !tutorScenarios.some((item) => sameTask(item.task, demo.task))
		)
	];
	const tutorials = [
		...tutorialChecks,
		...defaultFixtures.tutorials.filter(
			(demo) =>
				!tutorialChecks.some(
					(item) =>
						sameCourse(item.course, demo.course) &&
						item.tutorialId === demo.tutorialId &&
						item.checkId === demo.checkId
				)
		)
	];
	const exercises = [
		...exerciseChecks,
		...defaultFixtures.exercises.filter(
			(demo) => !exerciseChecks.some((item) => sameTask(item.task, demo.task))
		)
	];
	return { scenarios, tutorials, exercises };
}
