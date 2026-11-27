import { exercises } from '../../content/uebungen.js';

export function openExercises(
	done: readonly string[],
	hidden: readonly string[] = [],
	later: readonly string[] = []
) {
	return exercises
		.map((exercise, index) => ({ exercise, number: index + 1 }))
		.filter(({ exercise }) => {
			const id = exercise.task.taskId;
			return !done.includes(id) && !hidden.includes(id);
		})
		.sort(
			(left, right) =>
				later.indexOf(left.exercise.task.taskId) - later.indexOf(right.exercise.task.taskId)
		);
}

export function exerciseHref(listHref: string, taskId: string): string {
	return `${listHref}?task=${encodeURIComponent(taskId)}`;
}
