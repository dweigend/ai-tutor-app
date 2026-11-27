// Pure numerics for the tutorial labs. Everything runs in the browser on every input change.

const MINUS = '−';

/** German decimal comma, typographic minus, fixed digits so columns stay aligned. */
export function formatNumber(value: number, digits = 4): string {
	if (!Number.isFinite(value)) return value > 0 ? '∞' : `${MINUS}∞`;
	const text = value.toLocaleString('de-DE', {
		minimumFractionDigits: digits,
		maximumFractionDigits: digits,
		useGrouping: false
	});
	return text.replace('-', MINUS);
}

function toSuperscript(exponent: number): string {
	return exponent
		.toString()
		.replace('-', '⁻')
		.replace(/\d/g, (digit) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(digit)]);
}

/** Scientific notation for errors and tiny gradients, e.g. 4,5·10⁻⁵. */
export function formatScientific(value: number, digits = 1): string {
	if (value === 0) return '0';
	const [mantissa, exponent] = value.toExponential(digits).split('e');
	return `${mantissa.replace('.', ',').replace('-', MINUS)}·10${toSuperscript(Number(exponent))}`;
}

/** Formats `numerator / divisor` without overflowing to ±∞ for extreme finite logits. */
export function formatQuotient(numerator: number, divisor: number, digits = 2): string {
	if (numerator === 0) return formatNumber(0, digits);
	const quotient = numerator / divisor;
	if (Number.isFinite(quotient)) {
		return Math.abs(quotient) >= 1e9
			? formatScientific(quotient, 1)
			: formatNumber(quotient, digits);
	}
	if (!Number.isFinite(numerator) || !Number.isFinite(divisor) || divisor <= 0) {
		return formatNumber(quotient, digits);
	}
	const sign = numerator < 0 ? MINUS : '';
	const log10 = Math.log10(Math.abs(numerator)) - Math.log10(divisor);
	let exponent = Math.floor(log10);
	let mantissa = 10 ** (log10 - exponent);
	if (Number(mantissa.toFixed(1)) >= 10) {
		mantissa /= 10;
		exponent += 1;
	}
	const rounded = mantissa.toFixed(1).replace(/\.0$/, '').replace('.', ',');
	return `${sign}${rounded}·10${toSuperscript(exponent)}`;
}

/**
 * Numerically stable softmax of `logits / divisor` (temperature or √dₖ).
 * The maximum is subtracted from the raw logits before dividing, so even 1e308 / 0.25 cannot
 * overflow: every exponent stays at or below 0 and the largest term is exactly e⁰ = 1.
 * NaN counts as −∞ (weight 0); +∞ logits share the whole mass; an invalid divisor counts as 1.
 */
export function softmax(logits: readonly number[], divisor = 1): number[] {
	if (logits.length === 0) return [];
	const clean = logits.map((z) => (Number.isNaN(z) ? -Infinity : z));
	const infinite = clean.filter((z) => z === Infinity).length;
	if (infinite > 0) return clean.map((z) => (z === Infinity ? 1 / infinite : 0));
	const finite = clean.filter(Number.isFinite);
	if (finite.length === 0) return clean.map(() => 1 / clean.length);
	const scale = Number.isFinite(divisor) && divisor > 0 ? divisor : 1;
	const max = Math.max(...finite);
	// z − max can only reach −∞ (weight 0), never +∞ or NaN.
	const exps = clean.map((z) => (Number.isFinite(z) ? Math.exp((z - max) / scale) : 0));
	const sum = exps.reduce((total, value) => total + value, 0);
	return exps.map((value) => value / sum);
}

/** Shannon entropy in bits. */
export function entropyBits(probabilities: readonly number[]): number {
	return probabilities.reduce((total, p) => (p > 0 ? total - p * Math.log2(p) : total), 0);
}

/** mulberry32: a tiny seeded PRNG, enough for a repeatable sampling preview. */
function seededRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let mixed = state;
		mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
		mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
	};
}

function pickIndex(probabilities: readonly number[], roll: number): number {
	let cumulative = 0;
	for (const [index, p] of probabilities.entries()) {
		cumulative += p;
		if (roll < cumulative) return index;
	}
	return probabilities.length - 1;
}

/** How often each position is drawn in `draws` samples from a fixed seed. */
export function drawCounts(
	probabilities: readonly number[],
	draws: number,
	seed: number
): number[] {
	const random = seededRandom(seed);
	const counts = probabilities.map(() => 0);
	for (let draw = 0; draw < draws; draw += 1) counts[pickIndex(probabilities, random())] += 1;
	return counts;
}

// ---------------------------------------------------------------------------------------------
// Backpropagation on L = (a · b + c)², split into e = a · b, d = e + c, L = d · d.
// ---------------------------------------------------------------------------------------------

export interface BackpropSettings {
	a: number;
	b: number;
	c: number;
	squareAsProduct: boolean;
	activeEdges: { left: boolean; right: boolean };
	accumulation: 'add' | 'overwrite';
}

export type GraphNode = 'a' | 'b' | 'c' | 'e' | 'd' | 'L';

export interface BackpropResult {
	values: Record<GraphNode, number>;
	grads: Record<GraphNode, number>;
	/** What reaches d over each edge from L; null when the edge is off or does not exist. */
	contributions: { left: number | null; right: number | null };
}

export function loss(a: number, b: number, c: number): number {
	return (a * b + c) ** 2;
}

function dGradient(
	settings: BackpropSettings,
	d: number
): BackpropResult['contributions'] & {
	total: number;
} {
	if (!settings.squareAsProduct) return { left: null, right: null, total: 2 * d };
	// L = d · d: each input receives "the other factor times L.grad", with L.grad = 1.
	const left = settings.activeEdges.left ? d : null;
	const right = settings.activeEdges.right ? d : null;
	const arrived = [left, right].filter((value): value is number => value !== null);
	const total =
		settings.accumulation === 'add'
			? arrived.reduce((sum, value) => sum + value, 0)
			: (arrived.at(-1) ?? 0); // overwrite: the edge processed last wins
	return { left, right, total };
}

export function backpropagate(settings: BackpropSettings): BackpropResult {
	const { a, b, c } = settings;
	const e = a * b;
	const d = e + c;
	const L = d * d;
	const { left, right, total } = dGradient(settings, d);
	return {
		values: { a, b, c, e, d, L },
		grads: { L: 1, d: total, e: total, c: total, a: total * b, b: total * a },
		contributions: { left, right }
	};
}

/** Central difference (f(x + h) − f(x − h)) / 2h; exact for quadratics up to rounding. */
export function centralDifference(f: (x: number) => number, x: number, h: number): number {
	return (f(x + h) - f(x - h)) / (2 * h);
}

export function numericGradients(
	a: number,
	b: number,
	c: number,
	h: number
): Record<GraphNode, number> {
	const e = a * b;
	const d = e + c;
	return {
		a: centralDifference((x) => loss(x, b, c), a, h),
		b: centralDifference((x) => loss(a, x, c), b, h),
		c: centralDifference((x) => loss(a, b, x), c, h),
		e: centralDifference((x) => (x + c) ** 2, e, h),
		d: centralDifference((x) => x * x, d, h),
		L: 1
	};
}
