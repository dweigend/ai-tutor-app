<script lang="ts">
	import { untrack } from 'svelte';
	import {
		drawValleySheet,
		fallbackReason,
		loadValleyScene,
		valley,
		valleyMarks,
		type ValleySceneParams,
		type Point
	} from '$lib/figures';
	import type { ValleyScene } from '$lib/figures/valley-scene';
	import type { ValleySheet } from '$lib/figures/fallback-2d';
	import { formatNumber } from './math';
	import { watchReducedMotion } from './reduced-motion';

	let {
		params,
		onheight,
		interactive = false,
		paused = false
	}: {
		params: ValleySceneParams;
		onheight?: (height: number) => void;
		interactive?: boolean;
		/** A covered figure does not draw frames (§9.3e). */
		paused?: boolean;
	} = $props();

	let prediction = $state<Point | null>(null);
	/** Keyboard cursor of the 2D sheet; shown while the sheet has keyboard focus. */
	let cursor = $state<Point | null>(null);
	let mode = $state<'3d' | '2d'>('2d');
	let reducedMotion = $state(false);
	let canvas = $state<HTMLCanvasElement>();
	let scene: ValleyScene | null = null;

	const n = (value: number, digits = 2) => formatNumber(value, digits);
	let surface = $derived(valley(params));
	// One point sequence for the 2D sheet, the 3D marks and the data table (§9.3b).
	let marks = $derived(valleyMarks(params));
	let sheet = $derived(
		mode === '2d' ? drawValleySheet({ ...params, prediction, cursor, steps: marks }) : null
	);

	$effect(() =>
		watchReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)'), (reduced) => {
			reducedMotion = reduced;
		})
	);

	$effect(() => {
		if (reducedMotion || !canvas || fallbackReason()) return;
		const target = canvas;
		let disposed = false;
		void loadValleyScene()
			.then((module) => {
				if (disposed) return;
				scene = module.createValleyScene({
					canvas: target,
					params: untrack(() => params),
					onlost: () => {
						scene?.dispose();
						scene = null;
						mode = '2d';
					},
					onpredict: interactive ? setPrediction : undefined,
					onreading: onheight && ((reading) => onheight?.(reading.z))
				});
				mode = '3d';
			})
			.catch(() => {
				if (!disposed) mode = '2d';
			});
		return () => {
			disposed = true;
			scene?.dispose();
			scene = null;
			mode = '2d';
		};
	});

	$effect(() => {
		const next = params;
		if (mode === '3d') untrack(() => scene?.set(next));
	});

	$effect(() => {
		const point = prediction;
		if (mode === '3d') untrack(() => scene?.setPrediction(point));
	});

	$effect(() => {
		const active = !paused;
		if (mode === '3d') untrack(() => scene?.setActive(active));
	});

	function onKey(event: KeyboardEvent) {
		if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
			event.preventDefault();
			scene?.turn(event.key === 'ArrowLeft' ? -1 : 1);
		} else if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			scene?.roll();
		}
	}

	$effect(() => {
		if (sheet) onheight?.(sheet.endHeight);
	});

	function setPrediction(point: Point) {
		prediction = point;
	}

	const CURSOR_STEP = 0.15;
	const KEY_STEPS: Record<string, [number, number]> = {
		ArrowLeft: [-1, 0],
		ArrowRight: [1, 0],
		ArrowUp: [0, 1],
		ArrowDown: [0, -1]
	};

	/** 2D sheet by keyboard: arrows move the open square, Enter or Space sets the prediction. */
	function onSheetKey(event: KeyboardEvent) {
		if (!interactive) return;
		const e = surface.extent;
		const clamp = (value: number) =>
			Math.round(Math.max(-e, Math.min(e, value)) / CURSOR_STEP) * CURSOR_STEP;
		const from = cursor ?? prediction ?? { x: 0, y: 0 };
		const step = KEY_STEPS[event.key];
		if (step) {
			event.preventDefault();
			cursor = {
				x: clamp(from.x + step[0] * CURSOR_STEP),
				y: clamp(from.y + step[1] * CURSOR_STEP)
			};
		} else if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			if (!event.repeat) setPrediction(from);
			cursor = from;
		}
	}

	let cursorText = $derived(cursor ? `Marke bei x ${n(cursor.x)}, y ${n(cursor.y)}.` : '');
	let predictionText = $derived(
		prediction ? `Vorhersage gesetzt bei x ${n(prediction.x)}, y ${n(prediction.y)}.` : ''
	);

	function predictOnSheet(event: PointerEvent, size: number) {
		if (!interactive || event.button !== 0) return;
		const svg = event.currentTarget;
		if (!(svg instanceof SVGSVGElement)) return;
		const transform = svg.getScreenCTM();
		if (!transform) return;
		const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse());
		const e = surface.extent;
		const coord = (value: number) =>
			Math.max(-e, Math.min(e, (((value - 12) / (size - 24)) * 2 - 1) * e));
		setPrediction({ x: coord(point.x), y: -coord(point.y) });
	}
</script>

<div class="figure-plate-canvas stage-figure" data-mode={mode}>
	{#if !reducedMotion}
		<canvas
			bind:this={canvas}
			class="figure-canvas"
			class:pending={mode !== '3d'}
			tabindex={mode === '3d' ? 0 : -1}
			aria-label="Tal, mit Pfeiltasten drehbar, Eingabe rollt die Kugel neu"
			onkeydown={onKey}
		></canvas>
	{/if}
	{#if sheet}
		{#if interactive}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (role
			     application: a 2D picker with its own arrow, Enter and Space keys, §9.3f) -->
			<svg
				class="sheet"
				viewBox="0 0 {sheet.size} {sheet.size}"
				role="application"
				tabindex="0"
				aria-roledescription="Tal"
				aria-label="Tal von oben: Höhenlinien, {sheet.marks
					.length} nummerierte Schritte. Pfeiltasten bewegen die Vorhersagemarke, Eingabe oder Leertaste setzt die Vorhersage."
				onpointerdown={(event) => predictOnSheet(event, sheet.size)}
				onkeydown={onSheetKey}
				onblur={() => (cursor = null)}
			>
				{@render sheetContent(sheet)}
			</svg>
		{:else}
			<svg
				class="sheet"
				viewBox="0 0 {sheet.size} {sheet.size}"
				role="img"
				aria-label="Tal von oben: Höhenlinien, {sheet.marks.length} nummerierte Schritte"
			>
				{@render sheetContent(sheet)}
			</svg>
		{/if}
	{/if}
</div>
{#if interactive}
	<p class="visually-hidden" aria-live="polite">{cursorText} {predictionText}</p>
{/if}

{#snippet sheetContent(sheet: ValleySheet)}
	<path class="ink" d={sheet.frame} />
	{#each sheet.contours as contour, index (index)}
		<path class="ink" d={contour} />
	{/each}
	<path class="ink" d={sheet.steps} />
	{#each sheet.marks as mark (mark.label)}
		<rect
			class={mark.stray ? 'stray' : 'mark'}
			x={mark.x - 3}
			y={mark.y - 3}
			width="6"
			height="6"
		/>
		<text class="mark-label" x={mark.x + 6} y={mark.y - 5}>{mark.label}</text>
	{/each}
	{#if sheet.prediction}
		<rect
			class="prediction"
			x={sheet.prediction.x - 6}
			y={sheet.prediction.y - 6}
			width="12"
			height="12"
		/>
	{/if}
	{#if sheet.cursor}
		<rect class="cursor" x={sheet.cursor.x - 6} y={sheet.cursor.y - 6} width="12" height="12" />
	{/if}
	<circle class="ball" cx={sheet.ball.x} cy={sheet.ball.y} r="7" />
{/snippet}
<div class="visually-hidden">
	<table>
		<caption>
			{params.free ? 'Rechnerische Gradientenschritte' : 'Gradientenschritte'} bei η {n(
				params.eta,
				3
			)}, x-Krümmung {n(params.kappa)} und y-Krümmung {n(params.kappaY ?? 0.35)}
		</caption>
		<thead>
			<tr>
				<th scope="col">Schritt</th><th scope="col">x</th><th scope="col">y</th><th scope="col">
					f
				</th>
			</tr>
		</thead>
		<tbody>
			{#each marks as mark, index (index)}
				<tr>
					<th scope="row">{index}</th>
					<td>{n(mark.x, 4)}</td>
					<td>{n(mark.y, 4)}</td>
					<td>{n(surface.height(mark.x, mark.y), 4)}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.stage-figure {
		position: relative;
		min-block-size: 0;
	}

	.figure-canvas {
		position: absolute;
		inset: 0;
		display: block;
		inline-size: 100%;
		block-size: 100%;
		touch-action: pan-y;
		outline: none;
	}

	.figure-canvas:focus-visible {
		outline: var(--focus-width) solid var(--focus);
		outline-offset: calc(-1 * var(--focus-width));
	}

	.figure-canvas.pending {
		visibility: hidden;
	}

	.sheet {
		position: absolute;
		inset: 0;
		display: block;
		inline-size: 100%;
		block-size: 100%;
	}

	.ink {
		fill: none;
		stroke: var(--palette-ink);
		stroke-width: var(--hairline-width);
		vector-effect: non-scaling-stroke;
	}

	.mark {
		fill: var(--palette-ink);
	}

	.stray {
		fill: var(--palette-signal-crimson);
	}

	.mark-label {
		fill: var(--palette-ink);
		font-family: var(--font-mono);
		font-size: var(--type-label);
	}

	/* White with the ink edge: yellow belongs to the duck alone. */
	.prediction {
		fill: var(--palette-white);
		stroke: var(--palette-ink);
		stroke-width: var(--hairline-width);
		vector-effect: non-scaling-stroke;
	}

	.sheet:focus-visible {
		outline: var(--focus-width) solid var(--focus);
		outline-offset: calc(-1 * var(--focus-width));
	}

	.cursor {
		fill: none;
		stroke: var(--palette-ink);
		stroke-width: var(--hairline-width);
		vector-effect: non-scaling-stroke;
	}

	.ball {
		fill: var(--palette-signal-orange);
		stroke: var(--palette-ink);
		stroke-width: var(--hairline-width);
		vector-effect: non-scaling-stroke;
	}
</style>
