<script lang="ts">
	import 'katex/dist/katex.min.css';
	import type { FormulaNode } from './editorial-formulas.js';
	import { renderFormula } from './katex-render.js';

	let { formula, display = false }: { formula: FormulaNode; display?: boolean } = $props();
	let target = $state<HTMLSpanElement>();
	let rendered = $state(false);

	$effect(() => {
		if (target) rendered = renderFormula(formula.latex, target);
	});
</script>

<span
	class="formula"
	class:band={display}
	role="math"
	aria-label={formula.spoken}
	data-formula-id={formula.id}
	data-formula-spoken={formula.spoken}
>
	<!-- KaTeX keeps a single MathML tree. The accessible label supplies the German reading. -->
	<span bind:this={target} aria-hidden="true"></span>
	{#if !rendered}<span aria-hidden="true">{formula.spoken}</span>{/if}
</span>

<style>
	.formula {
		text-transform: none;
		letter-spacing: normal;
	}
	.band {
		display: block;
		padding: var(--space-m);
		background: var(--well);
		border-radius: var(--radius-flat);
		text-align: center;
		overflow-x: auto;
		overflow-wrap: anywhere;
	}
</style>
