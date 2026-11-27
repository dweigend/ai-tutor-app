import { sameTask } from '../api/types.js';
import type { TaskRef } from '../api/types.js';
import { exerciseForTask } from '../content/uebungen.js';
import type { ScreenContext, ScreenContextInput } from './types.js';

export const INDEPENDENT_PROBE_HELP =
	'In dieser Probe arbeitest du eigenständig. Sobald du sie abschließt oder bewusst verlässt, können wir fachlich weiterarbeiten.';

export function createScreenContext(
	input: ScreenContextInput,
	updatedAt = Date.now()
): ScreenContext {
	const screen = {
		...input,
		isIndependentProbe: input.isIndependentProbe ?? false,
		updatedAt
	};
	if (screen.taskRef && isProtectedTutorTurn(screen.taskRef, screen))
		screen.isIndependentProbe = true;
	return structuredClone(screen);
}

/** Each view publishes a complete context so navigation and moment changes clear stale terms. */
export class ScreenContextStore {
	private screen: ScreenContext;
	private readonly now: () => number;
	private readonly listeners = new Set<(screen: ScreenContext) => void>();

	constructor(initial: ScreenContextInput = { route: '/' }, now: () => number = Date.now) {
		this.now = now;
		this.screen = createScreenContext(initial, now());
	}

	setScreen(input: ScreenContextInput): void {
		this.screen = createScreenContext(input, this.now());
		for (const listener of this.listeners) listener(this.getSnapshot());
	}

	getSnapshot(): ScreenContext {
		return structuredClone(this.screen);
	}

	subscribe(listener: (screen: ScreenContext) => void): () => void {
		this.listeners.add(listener);
		listener(this.getSnapshot());
		return () => this.listeners.delete(listener);
	}
}

export function isProtectedTutorTurn(task: TaskRef, screen?: ScreenContext): boolean {
	if (screen?.isIndependentProbe) return true;
	const exercise = exerciseForTask(task.taskId);
	if (exercise?.format !== 'independent-probe' || !sameTask(task, exercise.task)) return false;
	return !(
		screen?.taskRef &&
		sameTask(task, screen.taskRef) &&
		screen.exerciseState?.revealed === true
	);
}
