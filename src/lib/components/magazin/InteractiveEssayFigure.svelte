<script lang="ts">
	import Formula from '$lib/math/Formula.svelte';
	import type { InteractiveFigure } from '$lib/content/magazin';
	import { DataViz, Fader, FigurePlate, Icon } from '$lib/modules';
	import DataTable from '$lib/modules/figure-plate/DataTable.svelte';
	import type { GraphEdge, GraphNode } from '$lib/modules/figure-plate/types';
	import {
		bastaniGroups,
		bastaniPhases,
		effectLabel,
		productGraph,
		scaledSoftmax,
		signedNumber
	} from './essay-figures';

	let { figure }: { figure: InteractiveFigure } = $props();

	const phaseKeys = ['practice', 'test'] as const;
	let phase = $state<(typeof phaseKeys)[number]>('practice');
	let study = $derived(bastaniPhases[phase]);
	// Keep the same scale across both phases: −20 to +130 percent.
	const negativeExtent = 20;
	const positiveExtent = 130;
	const studyZero = (100 * negativeExtent) / (negativeExtent + positiveExtent);
	const productFormulas = [
		{ id: 'essay-product', latex: String.raw`L = a \cdot b`, spoken: 'L gleich a mal b' },
		{
			id: 'essay-gradient-a',
			latex: String.raw`\frac{\partial L}{\partial a} = b`,
			spoken: 'Gradient von L nach a gleich b'
		},
		{
			id: 'essay-gradient-b',
			latex: String.raw`\frac{\partial L}{\partial b} = a`,
			spoken: 'Gradient von L nach b gleich a'
		}
	];

	const factorMin = -5;
	const factorMax = 5;
	const factors = Fader.evenDetents(factorMin, factorMax, 1);
	let preset = $state(0);
	let a = $state(2);
	let b = $state(-3);
	let aPosition = $state(2);
	let bPosition = $state(-3);
	let currentA = $derived(Fader.nearestDetent(aPosition, factors));
	let currentB = $derived(Fader.nearestDetent(bPosition, factors));
	let graph = $derived(productGraph(currentA, currentB));

	function equalFactors() {
		a = aPosition = 3;
		b = bPosition = 3;
		preset += 1;
	}

	const edges: GraphEdge[] = [
		{ from: 'a', to: 'product' },
		{ from: 'b', to: 'product' }
	];
	let nodes = $derived<GraphNode[]>([
		{
			id: 'a',
			label: `a = ${signedNumber(currentA)}`,
			notes: [`Gradient ${signedNumber(graph.gradientA)}`, `KI-Code ${signedNumber(currentA)}`],
			x: 128,
			y: 35
		},
		{
			id: 'b',
			label: `b = ${signedNumber(currentB)}`,
			notes: [`Gradient ${signedNumber(graph.gradientB)}`, `KI-Code ${signedNumber(currentB)}`],
			x: 128,
			y: 106
		},
		{
			id: 'product',
			label: `L = ${signedNumber(graph.product)}`,
			x: 208,
			y: 70,
			emphasis: true,
			side: 'right'
		}
	]);

	const scaleDetents = Fader.evenDetents(1, 10, 1);
	let scale = $state(1);
	let scalePosition = $state(1);
	let scaleFactor = $derived(Fader.nearestDetent(scalePosition, scaleDetents));
	let probabilities = $derived(scaledSoftmax(scaleFactor));
	const percent = new Intl.NumberFormat('de-DE', {
		style: 'percent',
		maximumFractionDigits: 3
	});

	function probabilityLabel(value: number): string {
		return value < 0.000005 ? '< 0,001 %' : percent.format(value);
	}
</script>

<FigurePlate.Root label={figure.title} class="interactive-essay-figure">
	<div class="essay-chart">
		<h3>{figure.title}</h3>
		{#if figure.kind === 'bastani'}
			<div class="chart-options" role="group" aria-label="Phase der Studie">
				{#each phaseKeys as key (key)}
					<button type="button" aria-pressed={phase === key} onclick={() => (phase = key)}>
						{#if phase === key}<Icon name="check" size={20} />{/if}
						{bastaniPhases[key].label}
					</button>
				{/each}
			</div>
			<div class="chart-rows" aria-hidden="true">
				{#each bastaniGroups as group, i (group)}
					{@const effect = study.effects[i]}
					<div class="chart-row">
						<span>{group}</span>
						<strong>{effectLabel(effect)}</strong>
						<div class="chart-track" style:--chart-zero="{studyZero}%">
							<span class="chart-zero"></span>
							<span
								class="chart-fill positive"
								style:--bar-share={Math.max(0, effect ?? 0) / positiveExtent}
							></span>
							<span
								class="chart-fill negative"
								style:--bar-share={-Math.min(0, effect ?? 0) / negativeExtent}
							></span>
						</div>
					</div>
				{/each}
			</div>
			<p class="visually-hidden" role="status">
				{study.label}. GPT Base {effectLabel(study.effects[0])}. GPT Tutor {study.effects[1] ===
				null
					? 'kein statistisch signifikanter Unterschied'
					: effectLabel(study.effects[1])}.
			</p>
			<DataTable
				caption="Bastani et al. (2025), Unterschied zur Kontrollgruppe"
				columns={['Gruppe', bastaniPhases.practice.label, bastaniPhases.test.label]}
				rows={bastaniGroups.map((group, i) => [
					group,
					effectLabel(bastaniPhases.practice.effects[i]),
					bastaniPhases.test.effects[i] === null
						? 'Kein statistisch signifikanter Unterschied (n. s.)'
						: effectLabel(bastaniPhases.test.effects[i])
				])}
			/>
		{:else if figure.kind === 'product'}
			<div class="factor-controls">
				{#each productFormulas as formula (formula.id)}
					<Formula {formula} />
				{/each}
			</div>
			<div class="product-graph">
				<FigurePlate.Canvas viewBox="0 0 320 140" grid="dots">
					<DataViz.Graph {nodes} {edges} title="Produkt und Rückwärtsgradienten" />
				</FigurePlate.Canvas>
			</div>
			{#key preset}
				<div class="factor-controls">
					<div>
						<p class="chart-value" aria-hidden="true">a = {signedNumber(currentA)}</p>
						<Fader.Fader
							min={factorMin}
							max={factorMax}
							detents={factors}
							bind:value={a}
							bind:position={aPosition}
							label="Faktor a"
							valuetext={signedNumber}
							padding={8}
						/>
					</div>
					<div>
						<p class="chart-value" aria-hidden="true">b = {signedNumber(currentB)}</p>
						<Fader.Fader
							min={factorMin}
							max={factorMax}
							detents={factors}
							bind:value={b}
							bind:position={bPosition}
							label="Faktor b"
							valuetext={signedNumber}
							padding={8}
						/>
					</div>
				</div>
			{/key}
			<button class="preset" type="button" onclick={equalFactors}>a = b = 3</button>
		{:else}
			<p class="chart-value" aria-hidden="true">Faktor {scaleFactor}×</p>
			<Fader.Fader
				min={1}
				max={10}
				detents={scaleDetents}
				bind:value={scale}
				bind:position={scalePosition}
				label="Skalierungsfaktor"
				valuetext={(value) => `${value}-fach`}
				padding={5}
			/>
			<div class="chart-rows" aria-hidden="true">
				{#each probabilities as { logit, probability }, i (i)}
					<div class="chart-row">
						<span>Logit {logit}</span>
						<strong>{probabilityLabel(probability)}</strong>
						<div class="chart-track">
							<span class="chart-fill" style:--bar-share={probability}></span>
						</div>
					</div>
				{/each}
			</div>
			<DataTable
				caption="Softmax bei {scaleFactor}-facher Skalierung"
				columns={['Klasse', 'Logit', 'Wahrscheinlichkeit']}
				rows={probabilities.map(({ logit, probability }, i) => [
					String(i + 1),
					String(logit),
					probabilityLabel(probability)
				])}
			/>
		{/if}
	</div>
	<FigurePlate.Caption>{figure.caption}</FigurePlate.Caption>
</FigurePlate.Root>

<style>
	:global(.interactive-essay-figure) {
		box-sizing: border-box;
		min-inline-size: 0;
		max-inline-size: 100%;
	}

	.essay-chart {
		grid-area: canvas;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--step-3);
	}

	/* Keep the plate's canvas grid area out of the controls' grid. */
	.product-graph {
		overflow: clip;
	}

	h3 {
		margin: 0;
		font-size: var(--type-body);
		font-weight: var(--font-weight-strong);
		line-height: var(--line-snug);
	}

	.chart-options,
	.factor-controls {
		display: flex;
		flex-wrap: wrap;
		gap: var(--step-2);
	}

	.factor-controls > div {
		flex: 1 1 8rem;
		min-inline-size: 0;
	}

	button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--step-1);
		min-block-size: var(--hit);
		padding-inline: var(--step-3);
		border: var(--hairline-width) solid var(--text);
		border-radius: var(--radius-pill);
		background: var(--surface);
		color: var(--text);
		font-size: var(--type-label);
		cursor: pointer;
		touch-action: manipulation;
	}

	button[aria-pressed='true'] {
		background: var(--mark);
		color: var(--mark-text);
	}

	button:focus-visible {
		outline: var(--focus-width) solid var(--focus);
		outline-offset: var(--focus-width);
	}

	.preset {
		justify-self: start;
	}

	.chart-value {
		margin: 0;
		font-variant-numeric: tabular-nums;
		font-weight: var(--font-weight-strong);
	}

	.chart-rows {
		display: grid;
		gap: var(--step-3);
	}

	.chart-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: var(--step-1) var(--step-2);
		font-size: var(--type-label);
		font-variant-numeric: tabular-nums;
	}

	.chart-track {
		position: relative;
		grid-column: 1 / -1;
		block-size: var(--step-2);
		background: var(--well);
	}

	.chart-zero {
		position: absolute;
		z-index: 1;
		inset-block: calc(-1 * var(--hairline-width));
		inset-inline-start: var(--chart-zero);
		inline-size: var(--hairline-width);
		background: var(--text);
	}

	.chart-fill {
		position: absolute;
		inset-block: 0;
		inset-inline: 0;
		background: var(--text);
		transform: scaleX(var(--bar-share));
		transform-origin: left;
	}

	.chart-fill.positive {
		inset-inline-start: var(--chart-zero);
	}

	.chart-fill.negative {
		inset-inline-end: calc(100% - var(--chart-zero));
		background: var(--grip);
		transform-origin: right;
	}

	@media (prefers-reduced-motion: no-preference) {
		.chart-fill {
			transition: transform 160ms ease-out;
		}
	}
</style>
