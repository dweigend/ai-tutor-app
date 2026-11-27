function count(value: number): number {
	return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export function todayProgress(done: number, planned: number) {
	const target = count(planned);
	const completed = Math.min(count(done), target);
	return {
		completed,
		target,
		label: `Heute: ${completed} von ${target} Lernschritten geschafft`
	};
}
