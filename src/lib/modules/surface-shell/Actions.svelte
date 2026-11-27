<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<!-- At most two round signs on the right: ReadAloud second from the right, the grid at the edge. -->
<div class="shell-actions">
	{@render children()}
</div>

<style>
	.shell-actions {
		display: flex;
		align-items: center;
		gap: var(--space-s);
		margin-inline-start: auto;
		padding-inline-end: var(--gutter);
	}
</style>
