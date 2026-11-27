<script lang="ts">
	import RichText from '../core/RichText.svelte';

	/** The matter in one line: Mono 11, at most 40 characters (DESIGN.md §10.1). */
	let { text }: { text: string } = $props();
</script>

<p class="stage-context m-label" data-budget="context"><RichText {text} /></p>
