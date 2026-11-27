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
