<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<!-- Sofort-Start (DESIGN.md §1.5): one 56px row, no line, content begins right below it. -->
<header class="shell-bar" data-row>
	{@render children()}
</header>

<style>
	.shell-bar {
		position: sticky;
		inset-block-start: 0;
		z-index: 10;
		display: flex;
		align-items: stretch;
		block-size: var(--bar);
		background: var(--surface);
		color: var(--text);
	}
</style>
