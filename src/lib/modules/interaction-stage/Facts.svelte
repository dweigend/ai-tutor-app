<script lang="ts">
	import RichText from '../core/RichText.svelte';
	import Facts from '../readout/Facts.svelte';
	import type { FactsData } from '../readout/types.js';

	let { facts, context }: { facts?: FactsData; context?: string } = $props();
</script>

<div class="stage-facts">
	{#if context}<p class="stage-facts-context"><RichText text={context} /></p>{/if}
	{#if facts}<Facts {facts} />{/if}
</div>
