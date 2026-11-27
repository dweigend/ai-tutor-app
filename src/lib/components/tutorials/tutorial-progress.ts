export interface TutorialProgress {
	index: number;
	reached: readonly number[];
}

const start: TutorialProgress = { index: 0, reached: [0] };

export function progressFor(
	places: ReadonlyMap<string, TutorialProgress>,
	tutorialId: string
): TutorialProgress {
	return places.get(tutorialId) ?? start;
}

export function rememberProgress(
	places: Map<string, TutorialProgress>,
	tutorialId: string,
	index: number,
	step: number
): TutorialProgress {
	const { reached } = progressFor(places, tutorialId);
	const progress = { index, reached: reached.includes(step) ? reached : [...reached, step] };
	places.set(tutorialId, progress);
	return progress;
}
