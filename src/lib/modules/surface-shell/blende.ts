import { prefersReducedMotion, springSamples } from '../core/motion.js';

/** Frame rate at which the snap spring is sampled into keyframes. */
const SAMPLE_FRAME_MS = 1000 / 60;
const NEW_PAGE = '::view-transition-new(root)';
const OLD_PAGE = '::view-transition-old(root)';
/** Lifts the old screen above the new one while it closes into a tile (default order: new on top). */
const OLD_ON_TOP = 2;

/** A rectangle in viewport px, e.g. from `getBoundingClientRect()`. */
export interface BlendeRect {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

/**
 * Where the wipe starts or ends (issue #10). Both are optional; without them the new screen runs
 * up from the bottom edge.
 */
export interface BlendeTile {
	/** Tile → area: the rectangle of the tapped tile, measured before the route changes. */
	from?: BlendeRect;
	/** Area → start: finds the tile's place on the new screen once it is rendered. */
	to?: () => BlendeRect | undefined;
}

/** `inset()` that cuts the viewport down to `rect`; `share` 0 is the full screen, 1 the rect. */
function insetToward(rect: BlendeRect, share: number, width: number, height: number): string {
	const top = rect.top * share;
	const right = (width - rect.right) * share;
	const bottom = (height - rect.bottom) * share;
	const left = rect.left * share;
	return `inset(${top}px ${right}px ${bottom}px ${left}px)`;
}

function keyframeTiming(samples: number[]): KeyframeAnimationOptions {
	return { duration: (samples.length - 1) * SAMPLE_FRAME_MS, easing: 'linear' };
}

/** Runs the wipe on the snap spring once both screens are captured. */
function runWipe(doc: Document, tile: BlendeTile): void {
	const samples = springSamples('snap');
	const root = doc.documentElement;
	const width = root.clientWidth;
	const height = root.clientHeight;
	const timing = keyframeTiming(samples);
	if (tile.from) {
		const from = tile.from;
		const clipPath = samples.map((progress) => insetToward(from, 1 - progress, width, height));
		root.animate({ clipPath }, { ...timing, pseudoElement: NEW_PAGE });
		return;
	}
	const to = tile.to?.();
	if (to) {
		const clipPath = samples.map((progress) => insetToward(to, progress, width, height));
		root.animate(
			{ clipPath, zIndex: [OLD_ON_TOP, OLD_ON_TOP] },
			{ ...timing, pseudoElement: OLD_PAGE }
		);
		return;
	}
	const clipPath = samples.map((progress) => `inset(${(1 - progress) * 100}% 0 0 0)`);
	root.animate({ clipPath }, { ...timing, pseudoElement: NEW_PAGE });
}

/**
 * Surface wipe between routes (DESIGN.md §4.5): a hard clip edge on the snap spring. From a
 * start tile the new surface opens out of the tile's rectangle; back to the start page the old
 * surface closes into the place of the tile it came from. No fade, no blur. Without View
 * Transitions or with reduced motion it returns undefined and the route changes as a hard cut.
 * Pass the router's completion promise; the returned promise resolves once the old screen is
 * captured (SvelteKit's `onNavigate` contract).
 */
export function startSurfaceBlende(
	doc: Document,
	complete: Promise<unknown>,
	tile: BlendeTile = {}
): Promise<void> | undefined {
	if (typeof doc.startViewTransition !== 'function' || prefersReducedMotion()) return undefined;
	return new Promise((captured) => {
		const transition = doc.startViewTransition(async () => {
			captured();
			await complete;
		});
		transition.ready.then(
			() => runWipe(doc, tile),
			// `ready` rejects when the browser skips the transition (e.g. a second navigation
			// started); the route then simply changes without a wipe.
			() => undefined
		);
	});
}
