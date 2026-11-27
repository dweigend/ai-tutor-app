<script lang="ts">
	import type { FigureSpec } from '$lib/content';
	import { DataViz, FigurePlate } from '$lib/modules';

	let { figure }: { figure: FigureSpec } = $props();
</script>

<!-- One figure per essay, only where the text states the numbers (konzept §4.4). -->
<FigurePlate.Root label={figure.title}>
	<FigurePlate.Canvas viewBox="0 0 320 200" grid="dots">
		{#if figure.kind === 'bars'}
			<DataViz.Bars bars={figure.bars} title={figure.title} unit={figure.unit} />
		{:else}
			<DataViz.Graph nodes={figure.nodes} edges={figure.edges} title={figure.title} />
		{/if}
	</FigurePlate.Canvas>
	<FigurePlate.Caption>{figure.caption}</FigurePlate.Caption>
</FigurePlate.Root>
