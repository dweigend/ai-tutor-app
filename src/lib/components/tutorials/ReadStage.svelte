<script lang="ts">
	import type { FormulaSelection } from '$lib/math';
	import { InteractionStage as Stage, ReadAloud } from '$lib/modules';
	import { markdownSpoken } from './markdown';
	import Markdown from './Markdown.svelte';

	let {
		markdown,
		onnext,
		ontermchange
	}: {
		markdown: string;
		onnext: () => void;
		ontermchange?: (selection: FormulaSelection | null) => void;
	} = $props();
</script>

<div class="reading">
	<ReadAloud.Scope>
		<Stage.Head say={markdownSpoken(markdown)}>
			<Markdown source={markdown} {ontermchange} />
		</Stage.Head>
		<button type="button" class="m-hit m-key action" data-primary-action onclick={onnext}>
			Weiter
		</button>
	</ReadAloud.Scope>
</div>

<style>
	.reading {
		display: grid;
		grid-template-areas: 'head' 'action';
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-m);
		--gutter: 0px;
	}

	.reading :global(.stage-head) {
		padding-block-start: 0;
	}

	.action {
		grid-area: action;
		inline-size: 100%;
		block-size: var(--control);
		border-radius: var(--radius-pill);
		white-space: nowrap;
	}
</style>
