<script lang="ts">
	import type { Snippet } from 'svelte';
	import { PageHead } from '$lib/modules';

	let { title, backHref, children }: { title: string; backHref?: string; children: Snippet } =
		$props();
</script>

<svelte:head>
	<title>{title}{backHref ? ' | Magazin' : ''} | Tutor</title>
</svelte:head>

<div data-surface="paper">
	<div class="magazine-head"><PageHead accent="magazine" {backHref} title="Magazin" /></div>
	{@render children()}
</div>

<style>
	.magazine-head {
		position: sticky;
		inset-block-start: 0;
		z-index: 10;
	}
</style>
