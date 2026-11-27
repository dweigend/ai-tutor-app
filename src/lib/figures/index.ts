/**
 * Entry of the figure library (ui/DESIGN.md §9.3a, §9.3h): Svelte-free TypeScript. This file
 * imports no three; the scenes come in with import() only when a 3D figure is shown, so the
 * chunk with three never reaches a page without a figure.
 */
export { FIGURE_FPS, IDLE_GAP_MS, WATER_SHARE } from './poses.js';
export {
	attentionWeights,
	comparisonValleys,
	diverges,
	gradientSteps,
	sampleGrid,
	softmax,
	stepFactor,
	valley,
	valleyMarks,
	VALLEY_EXTENT,
	VALLEY_KAPPA_Y,
	VALLEY_MARK_COUNT,
	type Point,
	type SurfaceFn,
	type ValleySceneParams,
	type ValleyParams
} from './surface.js';
export {
	BallIntegrator,
	DEFAULT_PHYSICS,
	PHYSICS_HZ,
	simulate,
	type BallState,
	type PhysicsParams,
	type TracePoint
} from './physics.js';
export { drawValleySheet, drawReliefSheet, type SheetMark } from './fallback-2d.js';

/** Why a figure shows its standing 2D sheet instead of 3D, or null for 3D (§9.3f, §4.8). */
export type FallbackReason = 'reduced-motion' | 'save-data' | 'no-webgl';

let webgl: boolean | null = null;

/** WebGL 2 present? The print pass needs texelFetch and integer pixel addressing. */
export function webglAvailable(): boolean {
	if (webgl !== null) return webgl;
	try {
		const canvas = document.createElement('canvas');
		const context = canvas.getContext('webgl2');
		webgl = !!context;
		context?.getExtension('WEBGL_lose_context')?.loseContext();
	} catch {
		webgl = false;
	}
	return webgl;
}

export function fallbackReason(): FallbackReason | null {
	if (typeof window === 'undefined') return 'no-webgl';
	if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 'reduced-motion';
	const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
	if (connection?.saveData) return 'save-data';
	if (!webglAvailable()) return 'no-webgl';
	return null;
}

export const loadDuckScene = () => import('./duck-scene.js');
export * from './duck-wardrobe.js';
export {
	createWebGLCoordinator,
	webglCoordinator,
	type WebGLPriority
} from './webgl-coordinator.js';
import { createLabWithSlot } from './webgl-coordinator.js';
import type { DuckPose as LegacyPose } from './poses.js';
export const DUCK_POSES = [
	'idle',
	'look_around',
	'listen',
	'think',
	'speak',
	'giggle',
	'nod',
	'shake',
	'celebrate'
] as const;
export type DuckClip = (typeof DUCK_POSES)[number];
export type DuckPose = DuckClip | LegacyPose;
export function duckClip(pose: DuckPose): DuckClip {
	return pose === 'wait' || pose === 'idle_dip' ? 'idle' : pose;
}
export const loadValleyScene = async () => {
	const module = await import('./valley-scene.js');
	return {
		...module,
		createValleyScene: (options: Parameters<typeof module.createValleyScene>[0]) =>
			createLabWithSlot(() => module.createValleyScene(options))
	};
};
export const loadReliefScene = async () => {
	const module = await import('./relief-scene.js');
	return {
		...module,
		createReliefScene: (options: Parameters<typeof module.createReliefScene>[0]) =>
			createLabWithSlot(() => module.createReliefScene(options))
	};
};

import { softmax as deckSoftmax } from './surface.js';
import { backpropagate } from '../components/tutorials/math.js';

export type AttentionTerm = 'Q' | 'K' | 'V' | 'dk' | 'softmax';
export interface AttentionDeckParams {
	slide: number;
	focusToken?: number;
	scaleOn?: boolean;
	temperature?: number;
	highlightTerm?: AttentionTerm | null;
	matchedTerms?: readonly AttentionTerm[];
}
export type BackpropNode = 'a' | 'b' | 'c' | 'mul' | 'add' | 'loss';
export interface BackpropDeckParams {
	slide: number;
	a?: number;
	b?: number;
	c?: number;
	lr?: number;
	highlightNode?: BackpropNode | null;
}
export interface DeckSceneOptions<P> {
	canvas: HTMLCanvasElement;
	params?: Partial<P>;
	onlost?: () => void;
}
export interface DeckSceneHandle<P> {
	update(partial: Partial<P>): void;
	pulseCorrect(target?: string): void;
	pulseError(target?: string): void;
	resize(): void;
	dispose(): void;
}

function finite(value: number | undefined, fallback: number) {
	return value !== undefined && Number.isFinite(value) ? value : fallback;
}
function deckSlide(slide?: number) {
	return Math.min(4, Math.max(0, Math.round(finite(slide, 0))));
}

// A four-dimensional head with identity query and key projections.
const tokens = [
	[2, 1, 0, 0],
	[1, 2, 1, 0],
	[0, 1, 2, 1],
	[0, 0, 1, 2]
];
const values = [
	[1, 0.2, 0.1],
	[0.25, 1, 0.2],
	[0.1, 0.3, 1],
	[0.6, 0.15, 0.8]
];

export function computeAttentionDeckState(params: Partial<AttentionDeckParams> = {}) {
	const slide = deckSlide(params.slide);
	const focusToken = Math.min(3, Math.max(0, Math.round(finite(params.focusToken, 0))));
	const temperature = Math.max(0.5, Math.min(2.5, finite(params.temperature, 1)));
	const scaleOn = params.scaleOn ?? true;
	const query = tokens[focusToken];
	const rawScores = tokens.map((key) => key.reduce((sum, k, i) => sum + k * query[i], 0));
	const logits = rawScores.map((score) => (scaleOn ? score / Math.sqrt(query.length) : score));
	const weights = deckSoftmax(logits, temperature);
	const contributions = values.map((v, i) => v.map((component) => component * weights[i]));
	const context = values[0].map((_, j) => contributions.reduce((sum, v) => sum + v[j], 0));
	return {
		slide,
		focusToken,
		temperature,
		scaleOn,
		rawScores,
		logits,
		weights,
		contributions,
		context,
		highlightTerm: params.highlightTerm ?? null,
		matchedTerms: [...(params.matchedTerms ?? [])]
	};
}

export function computeBackpropDeckState(params: Partial<BackpropDeckParams> = {}) {
	const a = finite(params.a, 2),
		b = finite(params.b, 3),
		c = finite(params.c, -1);
	const lr = Math.min(0.8, Math.max(0.05, finite(params.lr, 0.25)));
	const { values, grads, contributions } = backpropagate({
		a,
		b,
		c,
		squareAsProduct: true,
		activeEdges: { left: true, right: true },
		accumulation: 'add'
	});
	// Hold a and b fixed. In residual coordinates the loss slice is L(d) = d².
	const descent = [values.d];
	for (let step = 0; step < 12; step++) descent.push(descent[step] * (1 - 2 * lr));
	return {
		slide: deckSlide(params.slide),
		a,
		b,
		c,
		lr,
		loss: values.L,
		values,
		gradients: grads,
		contributions,
		descent,
		highlightNode: params.highlightNode ?? null
	};
}

function deckSheet(canvas: HTMLCanvasElement) {
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;
	const width = canvas.clientWidth || canvas.width || 320;
	const height = canvas.clientHeight || canvas.height || 200;
	const dpi = Math.min(globalThis.devicePixelRatio || 1, 2);
	canvas.width = Math.round(width * dpi);
	canvas.height = Math.round(height * dpi);
	ctx.setTransform(dpi, 0, 0, dpi, 0, 0);
	ctx.fillStyle = '#f4f1ea';
	ctx.fillRect(0, 0, width, height);
	const scale = Math.min(width / 360, height / 200);
	ctx.translate((width - 360 * scale) / 2, (height - 200 * scale) / 2);
	ctx.scale(scale, scale);
	ctx.textAlign = 'center';
	ctx.font = 'bold 14px sans-serif';
	return ctx;
}

export function drawAttentionDeckFallback(
	canvas: HTMLCanvasElement,
	params: Partial<AttentionDeckParams> = {}
) {
	const ctx = deckSheet(canvas);
	if (!ctx) return;
	const s = computeAttentionDeckState(params);
	const tokenHeights = [0.76, 0.95, 1.14, 1.33];
	const amounts = [tokenHeights, s.rawScores, s.logits, s.weights, s.weights][s.slide];
	const factor = [52, 13, 13, 100, 100][s.slide];
	if (s.slide === 1) {
		const qx = 50 + s.focusToken * 86;
		ctx.fillStyle = '#1f56d8';
		ctx.fillText('Q' + (s.focusToken + 1), qx, 22);
		s.rawScores.forEach((score, i) => {
			const x = 50 + i * 86;
			ctx.beginPath();
			ctx.moveTo(qx, 28);
			ctx.lineTo(x, 143 - score * factor);
			ctx.strokeStyle = '#1f56d8';
			ctx.lineWidth = 0.75 + score * 0.52;
			ctx.stroke();
		});
	}
	amounts.forEach((value, i) => {
		const x = 50 + i * 86,
			h = value * factor;
		ctx.fillStyle = i === s.focusToken ? '#1f56d8' : '#e85d1a';
		ctx.fillRect(x - 16, 143 - h, 32, h);
		ctx.fillStyle = '#0a0a0a';
		if (s.slide > 0)
			ctx.fillText(s.slide >= 3 ? Math.round(100 * value) + '%' : String(value), x, 134 - h);
		ctx.fillText(['T', 'K', 'z', 'α', 'V'][s.slide] + (i + 1), x, 162);
	});
	if (s.slide === 4) {
		const terms: AttentionTerm[] = ['Q', 'K', 'dk', 'softmax', 'V'];
		terms.forEach((term, i) => {
			ctx.fillStyle = s.matchedTerms.includes(term)
				? '#22c55e'
				: s.highlightTerm === term
					? '#1f56d8'
					: '#0a0a0a';
			ctx.fillText(term === 'dk' ? '√dₖ' : term, 40 + i * 70, 187);
		});
		ctx.fillStyle = '#0a0a0a';
		ctx.fillText('Σ αᵢVᵢ = (' + s.context.map((v) => v.toFixed(2)).join(' · ') + ')', 180, 20);
	}
}

export function drawBackpropDeckFallback(
	canvas: HTMLCanvasElement,
	params: Partial<BackpropDeckParams> = {}
) {
	const ctx = deckSheet(canvas);
	if (!ctx) return;
	const s = computeBackpropDeckState(params);
	if (s.slide === 4) {
		const y = (x: number) => 157 - 110 * x * x;
		ctx.beginPath();
		for (let i = -50; i <= 50; i++) {
			const x = i / 50;
			if (i === -50) ctx.moveTo(180 + 145 * x, y(x));
			else ctx.lineTo(180 + 145 * x, y(x));
		}
		ctx.strokeStyle = '#0a0a0a';
		ctx.stroke();
		s.descent.forEach((d, i) => {
			const x = d / Math.max(1, Math.abs(s.values.d));
			ctx.fillStyle = i === 0 ? '#e85d1a' : '#1f56d8';
			ctx.beginPath();
			ctx.arc(180 + 145 * x, y(x), 4, 0, 2 * Math.PI);
			ctx.fill();
		});
		ctx.fillText('L = d²', 180, 184);
		return;
	}
	const nodes: BackpropNode[] = ['a', 'b', 'c', 'mul', 'add', 'loss'];
	const coords = [
		[24, 46],
		[24, 112],
		[108, 156],
		[108, 76],
		[206, 100],
		[324, 100]
	];
	const edges = [
		[0, 3],
		[1, 3],
		[3, 4],
		[2, 4],
		[4, 5],
		[4, 5]
	];
	edges.forEach(([from, to], i) => {
		const [x, y] = coords[from],
			[u, v] = coords[to];
		ctx.beginPath();
		ctx.moveTo(x, y);
		ctx.quadraticCurveTo((x + u) / 2, (y + v) / 2 + (i === 4 ? -60 : i === 5 ? 60 : 0), u, v);
		ctx.strokeStyle = s.slide >= 2 ? '#b81444' : '#1f56d8';
		ctx.stroke();
	});
	const v = s.slide === 2 ? s.gradients : s.values;
	const labels = [v.a, v.b, v.c, v.e, v.d, v.L];
	nodes.forEach((node, i) => {
		const [x, y] = coords[i];
		ctx.fillStyle = node === s.highlightNode ? '#1f56d8' : '#0a0a0a';
		ctx.beginPath();
		ctx.arc(x, y, 16, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = '#f4f1ea';
		ctx.fillText(['a', 'b', 'c', '×', '+', 'L'][i], x, y + 5);
		ctx.fillStyle = '#0a0a0a';
		ctx.fillText(String(labels[i]), x, y + 35);
	});
	if (s.slide === 3) ctx.fillText(s.values.d + ' + ' + s.values.d + ' = ' + s.gradients.d, 260, 37);
}
export const loadAttentionDeckScene = async () => {
	const module = await import('./attention-deck-scene.js');
	return {
		createAttentionDeckScene: (options: DeckSceneOptions<AttentionDeckParams>) =>
			createLabWithSlot(() => module.createAttentionDeckScene(options)),
		computeAttentionDeckState,
		drawAttentionDeckFallback
	};
};
export const loadBackpropDeckScene = async () => {
	const module = await import('./backprop-deck-scene.js');
	return {
		createBackpropDeckScene: (options: DeckSceneOptions<BackpropDeckParams>) =>
			createLabWithSlot(() => module.createBackpropDeckScene(options)),
		computeBackpropDeckState,
		drawBackpropDeckFallback
	};
};
