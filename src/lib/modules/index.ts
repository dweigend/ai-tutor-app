/**
 * The v2 parts (ui/DESIGN.md §11). Nothing here imports $app, $lib/api, $lib/content gsap or three;
 * links, routes, adapters and data come in as props. Shared skin: ./modules.css.
 */
export { default as AxisPad } from './axis-pad/AxisPad.svelte';
export { default as BoardCanvas } from './board-canvas/BoardCanvas.svelte';
export { INKS, type InkColor, type Point, type Stroke } from './board-canvas/strokes.js';
export * as motion from './core/motion.js';
export * as DataViz from './figure-plate/dataviz.js';
export * as Fader from './fader/index.js';
export * as FigurePlate from './figure-plate/index.js';
export * as Fold from './fold/index.js';
export * as InteractionStage from './interaction-stage/index.js';
export * as Raster from './raster/index.js';
export * as ReadAloud from './read-aloud/index.js';
export * as Readout from './readout/index.js';
export * as SurfaceShell from './surface-shell/index.js';
export { default as RichText } from './core/RichText.svelte';
export { default as SwipeRow } from './core/SwipeRow.svelte';

export {
	BUDGET,
	budgetGuard,
	countLines,
	evaluateBudget,
	measureStage,
	type BudgetViolation,
	type StageMeasure
} from './core/budget.js';
export { parseRichText, plainRichText, speakRichText, type RichToken } from './core/rich-text.js';
export type { StageState } from './interaction-stage/context.js';
export type { CodeSide, Fact, FactsData, Finding, PairSide } from './readout/types.js';
export type { Slab } from './raster/types.js';
export type { Certainty, Confidence } from './fader/scale.js';
export type {
	BarDatum,
	CurvePoint,
	GraphEdge,
	GraphNode,
	LayerDatum
} from './figure-plate/types.js';

export { default as Icon } from './core/Icon.svelte';
export { ICONS, ICON_NAMES, type IconName } from './core/icons.js';
export {
	SPRINGS,
	animate,
	carryVelocity,
	prefersReducedMotion,
	springSamples,
	stepSpring,
	type Animation,
	type MotionPreset,
	type Spring
} from './core/motion.js';
export { isArmed, releaseAction, swipe, type SwipeAction } from './core/swipe.js';
export { createReadAloud, type ReadAloudController } from './read-aloud/controller.js';
export {
	createBrowserSpeechAdapter,
	type SpeechAdapter,
	type SpeechSegment
} from './read-aloud/speech.js';
export { startSurfaceBlende } from './surface-shell/blende.js';
export { ProgressDots, StatusSignal, TypeBadge } from './indicators/index.js';
export { PageHead, BottomBar, IconButton } from './surface-shell/index.js';
