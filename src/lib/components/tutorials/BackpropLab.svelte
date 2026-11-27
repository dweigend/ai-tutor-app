<script lang="ts">
	import { untrack } from 'svelte';
	import type { TutorialLab } from '$lib/content/types';
	import LabFrame from './LabFrame.svelte';
	import LabSlider from './LabSlider.svelte';
	import {
		backpropagate,
		formatNumber,
		formatScientific,
		numericGradients,
		type GraphNode
	} from './math';

	type BackpropConfig = Extract<TutorialLab, { kind: 'backpropagation' }>;

	interface Props {
		config: BackpropConfig;
		labId: string;
	}

	let { config, labId }: Props = $props();

	// Relative gap between backward pass and central difference that counts as a real mismatch.
	// Rounding at h = 10⁻⁸ stays near 10⁻⁷, a missing edge is off by whole units.
	const MISMATCH_TOLERANCE = 1e-3;
	const ROWS: readonly GraphNode[] = ['L', 'd', 'e', 'a', 'b', 'c'];
	const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';

	const initial = untrack(() => $state.snapshot(config));
	const initialExponent = Math.round(Math.log10(initial.finiteDifference.h));
	let a = $state(initial.inputs.a);
	let b = $state(initial.inputs.b);
	let c = $state(initial.inputs.c);
	let squareAsProduct = $state(initial.squareAsProduct);
	let leftEdge = $state(initial.activeEdges.left);
	let rightEdge = $state(initial.activeEdges.right);
	let accumulation = $state(initial.accumulation);
	let exponent = $state(initialExponent);

	let h = $derived(10 ** exponent);
	let result = $derived(
		backpropagate({
			a,
			b,
			c,
			squareAsProduct,
			activeEdges: { left: leftEdge, right: rightEdge },
			accumulation
		})
	);
	let numeric = $derived(numericGradients(a, b, c, h));
	let gaps = $derived(
		Object.fromEntries(
			ROWS.map((node) => [node, Math.abs(result.grads[node] - numeric[node])])
		) as Record<GraphNode, number>
	);
	let mismatched = $derived(
		new Set(
			ROWS.filter((node) => gaps[node] > MISMATCH_TOLERANCE * Math.max(1, Math.abs(numeric[node])))
		)
	);
	let overwriteVisible = $derived(
		squareAsProduct && accumulation === 'overwrite' && leftEdge && rightEdge
	);
	let hLabel = $derived(`10${power(exponent)}`);

	function power(value: number): string {
		return String(value)
			.replace('-', '⁻')
			.replace(/\d/g, (digit) => SUPERSCRIPT[Number(digit)]);
	}

	function reset() {
		a = initial.inputs.a;
		b = initial.inputs.b;
		c = initial.inputs.c;
		squareAsProduct = initial.squareAsProduct;
		leftEdge = initial.activeEdges.left;
		rightEdge = initial.activeEdges.right;
		accumulation = initial.accumulation;
		exponent = initialExponent;
	}

	function value(node: GraphNode): string {
		return formatNumber(result.values[node], 0);
	}

	function grad(node: GraphNode): string {
		return formatNumber(result.grads[node], 0);
	}

	function edgeLabel(contribution: number | null): string {
		return contribution === null ? 'aus' : `+${formatNumber(contribution, 0)}`;
	}
</script>

{#snippet accumulationModes()}
	<div class="modes" role="group" aria-label="Gradienten sammeln">
		<button
			type="button"
			aria-pressed={accumulation === 'add'}
			disabled={!squareAsProduct}
			onclick={() => (accumulation = 'add')}
		>
			+= addieren
		</button>
		<button
			type="button"
			aria-pressed={accumulation === 'overwrite'}
			disabled={!squareAsProduct}
			onclick={() => (accumulation = 'overwrite')}
		>
			= überschreiben
		</button>
	</div>
{/snippet}

{#snippet node(name: GraphNode, x: number, y: number, caption: string)}
	<g class="node" class:bad={mismatched.has(name)} transform="translate({x} {y})">
		<text class="caption" x="0" y="-5">{caption}</text>
		<rect width="72" height="44" />
		<line x1="0" y1="22" x2="72" y2="22" />
		<text class="val" x="6" y="15">{value(name)}</text>
		<text class="grad" x="6" y="37">∇ {grad(name)}</text>
	</g>
{/snippet}

<LabFrame
	{labId}
	title="Labor · Rückwärts durch L = (a·b + c)²"
	tools={accumulationModes}
	onreset={reset}
>
	<figure class="graph">
		<svg
			viewBox="0 0 372 228"
			role="img"
			aria-labelledby="{labId}-graph-title"
			preserveAspectRatio="xMidYMid meet"
		>
			<title id="{labId}-graph-title">
				Rechengraph: a und b gehen in e = a·b, e und c in d = e + c, d in L. d.grad = {grad('d')},
				a.grad = {grad('a')}.
			</title>
			<g class="edges">
				<path d="M76 36 L116 62" />
				<path d="M76 108 L116 78" />
				<path d="M188 70 L200 70 L200 136 L208 136" />
				<path d="M76 186 L200 186 L200 152 L208 152" />
				{#if squareAsProduct}
					<path
						class:off={!leftEdge}
						class:lost={overwriteVisible}
						d="M280 134 C296 110 300 110 300 134"
					/>
					<path class:off={!rightEdge} d="M280 154 C296 178 300 178 300 154" />
				{:else}
					<path d="M280 144 L300 144" />
				{/if}
			</g>
			{#if squareAsProduct}
				<text class="edge-label" class:lost={overwriteVisible} x="290" y="104" text-anchor="middle">
					{edgeLabel(result.contributions.left)}
				</text>
				<text class="edge-label" x="290" y="194" text-anchor="middle">
					{edgeLabel(result.contributions.right)}
				</text>
			{:else}
				<text class="edge-label" x="290" y="134" text-anchor="middle">²</text>
			{/if}
			{@render node('a', 4, 14, 'a')}
			{@render node('b', 4, 86, 'b')}
			{@render node('c', 4, 164, 'c')}
			{@render node('e', 116, 48, 'e = a · b')}
			{@render node('d', 208, 122, 'd = e + c')}
			{@render node('L', 300, 122, squareAsProduct ? 'L = d · d' : 'L = d²')}
		</svg>
		<figcaption class="data muted">
			Oben der Wert, unten ∇ der Gradient aus dem Rückwärtslauf.
		</figcaption>
	</figure>

	<p class="status" aria-live="polite">
		{#if overwriteVisible}
			<strong>Überschrieben:</strong> Der rechte Beitrag ersetzt den linken. d.grad = {grad('d')} statt
			{formatNumber(2 * result.values.d, 0)}.
		{:else if mismatched.size}
			<strong>Weicht ab:</strong> Rückwärtslauf und Probe passen bei {[...mismatched].join(', ')} nicht
			zusammen.
		{:else}
			Rückwärtslauf und numerische Probe stimmen überein.
		{/if}
	</p>

	<div class="controls">
		<div class="inputs">
			<LabSlider label="a" bind:value={a} range={initial.inputRange} display={formatNumber(a, 0)} />
			<LabSlider label="b" bind:value={b} range={initial.inputRange} display={formatNumber(b, 0)} />
			<LabSlider label="c" bind:value={c} range={initial.inputRange} display={formatNumber(c, 0)} />
		</div>
		<div class="toggles">
			<label class="switch">
				<input type="checkbox" role="switch" bind:checked={squareAsProduct} />
				<span class="switch-track" aria-hidden="true"></span>
				<span>Quadrat als Produkt d · d</span>
			</label>
			<label class="switch">
				<input type="checkbox" role="switch" bind:checked={leftEdge} disabled={!squareAsProduct} />
				<span class="switch-track" aria-hidden="true"></span>
				<span>Linke Kante d → L</span>
			</label>
			<label class="switch">
				<input type="checkbox" role="switch" bind:checked={rightEdge} disabled={!squareAsProduct} />
				<span class="switch-track" aria-hidden="true"></span>
				<span>Rechte Kante d → L</span>
			</label>
		</div>
		<LabSlider
			label="Schrittweite h der Probe"
			bind:value={exponent}
			range={initial.finiteDifference.exponentRange}
			display={`h = ${hLabel}`}
			valueText={`h gleich 10 hoch ${exponent}`}
		/>
	</div>

	<table class="probe">
		<caption class="visually-hidden">Rückwärtslauf gegen zentrale Differenz</caption>
		<thead>
			<tr>
				<th scope="col" class="label">Knoten</th>
				<th scope="col" class="label">Rücklauf</th>
				<th scope="col" class="label">Probe</th>
				<th scope="col" class="label">Abstand</th>
			</tr>
		</thead>
		<tbody>
			{#each ROWS as row (row)}
				<tr class:bad={mismatched.has(row)}>
					<th scope="row" class="data">{row}.grad</th>
					<td class="data">{grad(row)}</td>
					<td class="data">{row === 'L' ? '1' : formatNumber(numeric[row], 4)}</td>
					<td class="data">
						{row === 'L' ? '–' : formatScientific(gaps[row])}
						{#if mismatched.has(row)}<span class="flag label">weicht ab</span>{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
	<p class="data muted">Probe: zentrale Differenz (f(x + h) − f(x − h)) / 2h mit h = {hLabel}.</p>
</LabFrame>

<style>
	.graph {
		display: grid;
		gap: var(--step-2);
		margin: 0;
	}

	svg {
		display: block;
		inline-size: 100%;
		max-inline-size: 34rem;
		block-size: auto;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}

	.edges path {
		fill: none;
		stroke: var(--palette-ink);
		stroke-width: 1.25;
	}

	.edges path.off {
		stroke: var(--text-muted);
		stroke-dasharray: 3 3;
	}

	.edges path.lost {
		stroke: var(--palette-signal-crimson);
		stroke-dasharray: 2 2;
	}

	.edge-label {
		fill: var(--palette-ink);
		font-size: 11px;
	}

	.edge-label.lost {
		fill: var(--palette-signal-crimson);
		text-decoration: line-through;
	}

	.node rect {
		fill: var(--palette-white);
		stroke: var(--palette-ink);
		stroke-width: 1;
	}

	.node line {
		stroke: var(--palette-ink);
		stroke-width: 0.5;
	}

	.node text {
		fill: var(--palette-ink);
		font-size: 12px;
	}

	.node .caption {
		font-size: 10px;
	}

	.node .grad {
		font-weight: 600;
	}

	.node.bad rect {
		stroke: var(--palette-signal-crimson);
		stroke-width: 3;
	}

	.status {
		padding: var(--step-3) var(--step-4);
		border-inline-start: var(--edge-width) solid var(--palette-ink);
		background: var(--surface);
		font-size: var(--type-body);
	}

	.inputs {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
		gap: var(--step-4);
	}

	.toggles {
		display: flex;
		flex-wrap: wrap;
		gap: 0 var(--step-5);
	}

	.probe {
		inline-size: 100%;
		border-collapse: collapse;
		table-layout: fixed;
	}

	.probe th,
	.probe td {
		padding: var(--step-2) var(--step-2) var(--step-2) 0;
		border-block-end: var(--hairline-width) solid var(--hairline);
		text-align: start;
		vertical-align: top;
		overflow-wrap: anywhere;
	}

	.probe thead th {
		padding-block-start: 0;
	}

	.probe tr.bad th {
		border-inline-start: 4px solid var(--palette-signal-crimson);
		padding-inline-start: var(--step-2);
	}

	.flag {
		display: inline-block;
		margin-block-start: var(--step-1);
		padding: 0.1rem var(--step-1);
		background: var(--palette-signal-crimson);
		color: var(--palette-white);
	}

	.modes button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
