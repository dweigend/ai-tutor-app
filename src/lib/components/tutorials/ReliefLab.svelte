<script lang="ts">
	import { untrack } from 'svelte';
	import type { TutorialLab } from '$lib/content/types';
	import { attentionWeights, drawReliefSheet, fallbackReason, loadReliefScene } from '$lib/figures';
	import type { Cell, ReliefScene } from '$lib/figures/relief-scene';
	import { Formula, InteractiveFormula, type FormulaSelection } from '$lib/math';
	import { reliefWeightsFormula, scalingFormula } from '$lib/math/lab-formulas.js';
	import { Fader, FigurePlate, Readout } from '$lib/modules';
	import LabStage from './LabStage.svelte';
	import LabFinding from './LabFinding.svelte';
	import { formatNumber } from './math';
	import { watchReducedMotion } from './reduced-motion';

	type SoftmaxConfig = Extract<TutorialLab, { kind: 'softmax-attention' }>;

	interface Props {
		config: SoftmaxConfig;
		context: string;
		onnext: () => void;
		ontermchange?: (selection: FormulaSelection | null) => void;
	}

	let { config, context, onnext, ontermchange }: Props = $props();

	const SIZE = 6;
	const TOKENS = ['t1', 't2', 't3', 't4', 't5', 't6'];

	/*
	 * Scores of the six queries: the task's logits ([20, 10, 0]) repeat backwards from the token
	 * itself, so every row has the same pattern and the mask cuts it off on the right.
	 */
	const scores = untrack(() =>
		Array.from({ length: SIZE }, (_, i) =>
			Array.from({ length: SIZE }, (_, j) => {
				const logits = config.logits;
				return logits[(((i - j) % logits.length) + logits.length) % logits.length];
			})
		)
	);
	const keyDimension = untrack(() => config.scaling.keyDimension);
	const range = untrack(() => config.sampling.range);
	const maxTemperature = Math.min(range.max, 4);
	const temperatures = Fader.evenDetents(range.min, maxTemperature, range.step);

	let instrument = $state<'temperature' | 'scaling'>('temperature');
	let temperature = $state(untrack(() => config.sampling.temperature));
	let scaled = $state(untrack(() => config.scaling.enabled));
	let activeRow = $state(SIZE - 1);
	let prediction = $state<Cell | null>(null);
	let mode = $state<'3d' | '2d'>('2d');
	let reducedMotion = $state(false);
	let covered = $state(false);
	let termHelpOpen = $state(false);
	let weightsFormula = $derived(reliefWeightsFormula(scaled));
	let canvas = $state<HTMLCanvasElement>();
	let scene: ReliefScene | null = null;

	const n = (value: number, digits = 2) => formatNumber(value, digits);

	let weights = $derived(attentionWeights(scores, { temperature, scaled, keyDimension }));
	let row = $derived(weights[activeRow]);
	let top = $derived(row.indexOf(Math.max(...row)));
	let sheet = $derived(mode === '2d' ? drawReliefSheet(weights, 52) : null);

	$effect(() =>
		watchReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)'), (reduced) => {
			reducedMotion = reduced;
		})
	);

	$effect(() => {
		if (reducedMotion || !canvas || fallbackReason()) return;
		const target = canvas;
		let disposed = false;
		void loadReliefScene()
			.then((module) => {
				if (disposed) return;
				scene = module.createReliefScene({
					canvas: target,
					weights: untrack(() => weights),
					activeRow: untrack(() => activeRow),
					prediction: null,
					onlost: () => {
						scene?.dispose();
						scene = null;
						mode = '2d';
					},
					onpick: pick
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
		const next = weights;
		if (mode === '3d') untrack(() => scene?.setWeights(next));
	});

	// Pause drawing while help has the learner’s attention.
	$effect(() => {
		const active = !covered && !termHelpOpen;
		if (mode === '3d') untrack(() => scene?.setActive(active));
	});

	$effect(() => {
		const next = activeRow;
		if (mode === '3d') untrack(() => scene?.setActiveRow(next));
	});

	$effect(() => {
		const next = prediction;
		if (mode === '3d') untrack(() => scene?.setPrediction(next));
	});

	/** A tap in the active row sets the own prediction (yellow cap); elsewhere it picks the row. */
	function pick(cell: Cell) {
		if (cell.row === activeRow) prediction = cell;
		else {
			activeRow = cell.row;
			prediction = null;
		}
	}

	function onSheetKey(event: KeyboardEvent & { currentTarget: SVGRectElement }, cell: Cell) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			if (!event.repeat) pick(cell);
			return;
		}
		if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
		event.preventDefault();
		const row = cell.row + (event.key === 'ArrowUp' ? -1 : 1);
		if (row < 0 || row >= SIZE) return;
		const col = Math.min(cell.col, row);
		pick({ row, col });
		event.currentTarget.ownerSVGElement
			?.querySelector<SVGRectElement>(`[data-cell="${row}-${col}"]`)
			?.focus();
	}

	function onKey(event: KeyboardEvent) {
		const turn = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
		if (turn) {
			event.preventDefault();
			scene?.turn(turn);
			return;
		}
		if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
			event.preventDefault();
			activeRow = Math.min(SIZE - 1, Math.max(0, activeRow + (event.key === 'ArrowUp' ? -1 : 1)));
			prediction = null;
			return;
		}
		const digit = Number(event.key);
		if (digit >= 1 && digit <= activeRow + 1) prediction = { row: activeRow, col: digit - 1 };
	}
</script>

<LabStage {context} {onnext} bind:covered>
	{#snippet figure()}
		<FigurePlate.Root index={2} label="Das Relief">
			<div class="figure-plate-canvas stage-figure">
				{#if !reducedMotion}
					<canvas
						bind:this={canvas}
						class="figure-canvas"
						class:pending={mode !== '3d'}
						tabindex={mode === '3d' ? 0 : -1}
						aria-label="Relief, Pfeiltasten drehen und wählen die Zeile, Ziffern setzen deine Vorhersage"
						onkeydown={onKey}
					></canvas>
				{/if}
				{#if sheet}
					<svg
						class="sheet"
						viewBox="-4 -4 {sheet.size + 8} {sheet.size + 8}"
						role="group"
						aria-label="Relief von oben. Pfeil nach oben oder unten wechselt die Zeile."
					>
						{#each sheet.cells as cell (`${cell.row}-${cell.col}`)}
							<rect
								class="cell-frame"
								aria-hidden="true"
								x={cell.col * 52}
								y={cell.row * 52}
								width="52"
								height="52"
							/>
							{#if !cell.masked}
								<rect
									class={cell.row === activeRow ? 'weight active' : 'weight'}
									aria-hidden="true"
									x={cell.x}
									y={cell.y}
									width={cell.side}
									height={cell.side}
								/>
								{#if prediction?.row === cell.row && prediction.col === cell.col}
									<rect
										class="cap"
										aria-hidden="true"
										x={cell.col * 52 + 4}
										y={cell.row * 52 + 4}
										width="10"
										height="10"
									/>
								{/if}
								<rect
									class="cell-pick"
									data-cell={`${cell.row}-${cell.col}`}
									x={cell.col * 52}
									y={cell.row * 52}
									width="52"
									height="52"
									role="button"
									tabindex={cell.row === activeRow ? 0 : -1}
									aria-label={cell.row === activeRow
										? `Vorhersage: Zeile ${cell.row + 1}, ${TOKENS[cell.col]}`
										: `Zeile ${cell.row + 1} wählen, ${TOKENS[cell.col]}`}
									aria-pressed={cell.row === activeRow ? prediction?.col === cell.col : undefined}
									onclick={() => pick(cell)}
									onkeydown={(event) => onSheetKey(event, cell)}
								/>
							{/if}
						{/each}
					</svg>
				{/if}
			</div>
			<div class="visually-hidden">
				<table>
					<caption>
						Attention-Gewichte bei T {n(temperature)}, {scaled ? 'mit' : 'ohne'} Division
					</caption>
					<thead>
						<tr>
							<th scope="col">Query</th>
							{#each TOKENS as token (token)}<th scope="col">{token}</th>{/each}
						</tr>
					</thead>
					<tbody>
						{#each weights as values, i (i)}
							<tr>
								<th scope="row">{TOKENS[i]}</th>
								{#each values as value, j (j)}
									<td>{j > i ? 'maskiert' : n(value, 4)}</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<FigurePlate.Caption>Scores aus [{config.logits.join(', ')}]</FigurePlate.Caption>
		</FigurePlate.Root>
	{/snippet}
	{#key scaled}
		<InteractiveFormula
			formula={weightsFormula}
			ontermchange={(selection) => {
				termHelpOpen = selection !== null;
				ontermchange?.(selection);
			}}
		/>
	{/key}
	<Readout.Facts
		facts={{
			kind: 'cells',
			cells: [
				{ label: 'Zeile', value: String(activeRow + 1) },
				{ label: 'T', value: n(temperature) },
				{ label: 'Spitze', value: 't' + (top + 1) },
				{ label: 'Gewicht', value: n(row[top]) }
			]
		}}
	/>
	<LabFinding
		deviates={prediction !== null && prediction.col !== top}
		text={prediction ? 'Vorhersage trifft zu.' : 'Tippen auf Orange setzt deine Vorhersage.'}
	/>
	<div class="settings" role="group" aria-label="Stellgröße">
		<button
			type="button"
			class="m-hit m-label"
			aria-pressed={instrument === 'temperature'}
			onclick={() => (instrument = 'temperature')}
		>
			T
		</button>
		<button
			type="button"
			class="m-hit m-label"
			aria-pressed={instrument === 'scaling'}
			onclick={() => (instrument = 'scaling')}
			aria-label="Skalierung wählen"
		>
			<Formula formula={scalingFormula} />
		</button>
	</div>
	<div class="instrument">
		{#if instrument === 'temperature'}
			<Fader.Fader
				min={range.min}
				max={maxTemperature}
				detents={temperatures}
				bind:value={temperature}
				valuetext={(value) => `T ${n(value)}`}
				label="Temperatur T"
			/>
		{:else}
			<button
				type="button"
				class="flip m-hit"
				aria-label="Durch die Wurzel aus d k teilen"
				aria-pressed={scaled}
				onclick={() => {
					scaled = !scaled;
					termHelpOpen = false;
					ontermchange?.(null);
				}}
			>
				<Formula formula={scalingFormula} />
			</button>
		{/if}
	</div>
</LabStage>

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
		inset: var(--step-3);
		display: block;
		inline-size: calc(100% - 2 * var(--step-3));
		block-size: calc(100% - 2 * var(--step-3));
	}

	.cell-frame {
		fill: none;
		stroke: var(--palette-ink);
		stroke-width: var(--hairline-width);
		vector-effect: non-scaling-stroke;
	}

	.cell-pick {
		fill: transparent;
		cursor: pointer;
		stroke-width: var(--focus-width);
		vector-effect: non-scaling-stroke;
	}

	.cell-pick:focus-visible {
		outline: none;
		stroke: var(--focus);
	}

	.weight {
		fill: var(--palette-paper);
		stroke: var(--palette-ink);
		stroke-width: var(--hairline-width);
		vector-effect: non-scaling-stroke;
	}

	.weight.active {
		fill: var(--palette-signal-orange);
	}

	.cap {
		fill: var(--palette-signal-yellow);
		stroke: var(--palette-ink);
		stroke-width: var(--hairline-width);
		vector-effect: non-scaling-stroke;
	}

	.settings {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		border-block: var(--hairline-width) solid var(--hairline);
	}

	.settings button {
		display: block;
		text-transform: none;
	}

	.settings button + button {
		border-inline-start: var(--hairline-width) solid var(--hairline);
	}

	.settings button[aria-pressed='true'] {
		background: var(--text);
		color: var(--surface);
	}

	.instrument {
		min-block-size: var(--hit);
	}

	.flip {
		inline-size: 100%;
		display: block;
		font-family: var(--font-mono);
		border: var(--hairline-width) solid var(--hairline);
	}

	.flip[aria-pressed='true'] {
		background: var(--mark);
		color: var(--mark-text);
	}
</style>
