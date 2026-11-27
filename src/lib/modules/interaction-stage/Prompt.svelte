<script lang="ts">
	import RichText from '../core/RichText.svelte';

	/** The question is also the heading of this moment. */
	let { text, id, heading = 'h1' }: { text: string; id?: string; heading?: 'h1' | 'h2' } = $props();
</script>

<svelte:element this={heading} class="stage-prompt" {id} data-budget="prompt">
	<RichText {text} />
</svelte:element>
