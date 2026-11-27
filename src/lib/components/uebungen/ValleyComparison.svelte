<script lang="ts">
	import { comparisonValleys } from '$lib/figures';
	import { FigurePlate, RichText } from '$lib/modules';
	import ValleyFigure from '../tutorials/ValleyFigure.svelte';

	const [gentle, steep] = comparisonValleys();
</script>

<FigurePlate.Root index={1} label="Zwei Täler mit demselben Start">
	<div class="figure-plate-canvas valleys">
		<section aria-label="Tal f">
			<p><RichText text="f = x² + y²" /></p>
			<ValleyFigure params={gentle} />
		</section>
		<section aria-label="Tal g">
			<p><RichText text="g = x² + 10y²" /></p>
			<ValleyFigure params={steep} />
		</section>
	</div>
	<FigurePlate.Caption>
		<RichText text="Start (1, 1) · η 0,085 · y-Faktor bei g −0,7" />
	</FigurePlate.Caption>
</FigurePlate.Root>

<style>
	.valleys {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--step-1);
	}
	section {
		display: grid;
		grid-template-rows: auto 1fr;
		min-inline-size: 0;
	}
	section + section {
		border-inline-start: var(--hairline-width) solid var(--hairline);
	}
	section p {
		margin: 0;
		text-align: center;
		font-family: var(--font-mono);
		font-size: var(--type-label);
	}
	section :global(.figure-plate-canvas) {
		grid-area: auto;
		justify-self: center;
		inline-size: min(100%, 31cqh);
		aspect-ratio: 1;
	}
</style>
