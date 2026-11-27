/**
 * The one renderer setup for the duck and the figures (ui/DESIGN.md §9.3, §14.4) plus the frame
 * loop that pauses for hidden tabs, figures out of view and a closed sheet (§9.3e).
 *
 * Material rule §9.1: no lights, no standard materials, no perspective camera, no environment map,
 * no tone mapping, no antialiasing. Every colour is written by an own shader.
 */
import { NoToneMapping, SRGBColorSpace, WebGLRenderer } from 'three';

/** Pixel ratio cap of the running UI (§9.2d). The reference proof may lift it to 3. */
export const MAX_PIXEL_RATIO = 2;

interface FigureHooks {
	/** Test hook for the DPR-3 reference proof, with `__figureHooks`: `__figureMaxPixelRatio = 3`. */
	__figureMaxPixelRatio?: number;
	/** Render calls per figure, read by the browser proofs (12 fps, 0 when closed). */
	__figureRenders?: Record<string, number>;
	/** Opt-in for the browser proofs: scenes register here to be driven by the test. */
	__figureHooks?: boolean;
	__figureScenes?: Record<string, unknown>;
	/** The 24-fps comparison of the duck (§9.2e): `window.__figureDuckFps = 24`. */
	__figureDuckFps?: 12 | 24;
}

function hooks(): FigureHooks {
	return globalThis as unknown as FigureHooks;
}

/** Hard ceiling of the test hook: the DPR-3 reference proof, never more. */
const HOOK_PIXEL_RATIO_LIMIT = 3;

/** The cap; `__figureMaxPixelRatio` lifts it only for the proofs (`__figureHooks`), at most to 3. */
export function pixelRatioCap(cap = MAX_PIXEL_RATIO): number {
	const target = hooks();
	const lifted = target.__figureMaxPixelRatio;
	if (!target.__figureHooks || typeof lifted !== 'number' || !Number.isFinite(lifted)) return cap;
	return Math.min(Math.max(lifted, 1), HOOK_PIXEL_RATIO_LIMIT);
}

/** Test hook only: with `window.__figureHooks = true` a scene can be driven by the proofs. */
export function registerScene(figure: string, scene: unknown) {
	const target = hooks();
	if (!target.__figureHooks) return;
	(target.__figureScenes ??= {})[figure] = scene;
}

export function duckFps(fallback: 12 | 24): 12 | 24 {
	return hooks().__figureDuckFps ?? fallback;
}

/** Counts render calls for the proofs only; without `__figureHooks` nothing global grows. */
export function countRender(figure: string) {
	const target = hooks();
	if (!target.__figureHooks) return;
	const counts = (target.__figureRenders ??= {});
	counts[figure] = (counts[figure] ?? 0) + 1;
}

export function createRenderer(canvas: HTMLCanvasElement, cap = MAX_PIXEL_RATIO): WebGLRenderer {
	const renderer = new WebGLRenderer({
		canvas,
		antialias: false,
		alpha: false,
		premultipliedAlpha: false,
		preserveDrawingBuffer: false,
		powerPreference: 'low-power'
	});
	renderer.outputColorSpace = SRGBColorSpace;
	renderer.toneMapping = NoToneMapping;
	renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, pixelRatioCap(cap)));
	renderer.autoClear = true;
	return renderer;
}

export interface LoopOptions {
	/** The element whose visibility pauses the loop. */
	element: Element;
	/**
	 * Called on every animation frame while the loop runs. Returns true while the figure still
	 * moves; false lets the loop sleep until `wake()`.
	 */
	frame: (now: number) => boolean;
}

/**
 * requestAnimationFrame only while the tab is visible, the figure intersects the viewport and
 * the owner says it is active. Otherwise no frame runs at all: 0 render calls.
 */
export class FigureLoop {
	private raf = 0;
	private visible = true;
	private intersecting = true;
	private active = true;
	private wanted = true;
	private readonly options: LoopOptions;
	private readonly observer: IntersectionObserver | null;
	private readonly onVisibility = () => {
		this.visible = document.visibilityState !== 'hidden';
		this.update();
	};

	constructor(options: LoopOptions) {
		this.options = options;
		this.visible = document.visibilityState !== 'hidden';
		document.addEventListener('visibilitychange', this.onVisibility);
		this.observer =
			typeof IntersectionObserver === 'undefined'
				? null
				: new IntersectionObserver((entries) => {
						this.intersecting = entries.some((entry) => entry.isIntersecting);
						this.update();
					});
		this.observer?.observe(options.element);
	}

	/** True while frames may run. */
	get running(): boolean {
		return this.visible && this.intersecting && this.active;
	}

	setActive(active: boolean) {
		this.active = active;
		this.update();
	}

	/** Ask for frames again, e.g. after a new pose or a slider move. */
	wake() {
		this.wanted = true;
		this.update();
	}

	dispose() {
		cancelAnimationFrame(this.raf);
		this.raf = 0;
		this.observer?.disconnect();
		document.removeEventListener('visibilitychange', this.onVisibility);
	}

	private update() {
		if (this.running && this.wanted) {
			if (!this.raf) this.raf = requestAnimationFrame(this.tick);
		} else if (this.raf) {
			cancelAnimationFrame(this.raf);
			this.raf = 0;
		}
	}

	private readonly tick = (now: number) => {
		this.raf = 0;
		if (!this.running) return;
		this.wanted = this.options.frame(now);
		this.update();
	};
}

/** A zero-sized canvas keeps its standing image until ResizeObserver reports layout. */
export function hasFigureLayout(canvas: HTMLCanvasElement): boolean {
	return canvas.clientWidth > 0 && canvas.clientHeight > 0;
}
