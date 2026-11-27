<script lang="ts">
	import type { Snippet } from 'svelte';
	let {
		reserveDuck = true,
		fixed = true,
		class: className = '',
		children
	}: { reserveDuck?: boolean; fixed?: boolean; class?: string; children: Snippet } = $props();
</script>

<div data-bottom-bar class={className} class:fixed class:reserve={reserveDuck}>
	{@render children()}
</div>

<style>
	div {
		background: var(--surface);
		color: var(--text);
		gap: var(--space-s);
		padding-inline: var(--space-m);
		padding-block-end: env(safe-area-inset-bottom);
	}
	.fixed {
		position: fixed;
		inset-block-end: 0;
		inset-inline: 0;
		z-index: 6;
	}
	.fixed.reserve {
		inset-inline-end: var(--corner-clearance);
	}
	.reserve:not(.fixed) {
		margin-inline-end: var(--corner-clearance);
	}
</style>
