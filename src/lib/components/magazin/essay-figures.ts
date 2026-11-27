export const bastaniPhases = {
	practice: { label: 'Mit Hilfe beim Üben', effects: [48, 127] },
	test: { label: 'Test ohne Hilfe', effects: [-17, null] }
} as const;

export const bastaniGroups = ['GPT Base', 'GPT Tutor'] as const;

export function effectLabel(effect: number | null): string {
	if (effect === null) return 'n. s.';
	return `${effect > 0 ? '+' : ''}${signedNumber(effect)} %`;
}

export function signedNumber(value: number): string {
	return String(value).replace('-', '−');
}

export function productGraph(a: number, b: number) {
	return { product: a * b, gradientA: b, gradientB: a };
}

/** Shifting all logits by the same value leaves softmax unchanged and avoids overflow. */
export function scaledSoftmax(factor: number) {
	const logits = [2 * factor, factor, 0];
	const max = Math.max(...logits);
	const weights = logits.map((logit) => Math.exp(logit - max));
	const sum = weights.reduce((total, weight) => total + weight, 0);
	return logits.map((logit, index) => ({ logit, probability: weights[index] / sum }));
}
