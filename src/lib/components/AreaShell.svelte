<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { ReadAloud, SurfaceShell } from '$lib/modules';
	import { areaFor, areaNumber, type AreaPath } from '$lib/navigation';

	interface Props {
		/** The area this page belongs to; sets the surface, the bar mark and the title. */
		area: AreaPath;
		children: Snippet;
		/** Aligns the bar and main content in a wider, centered frame. */
		framed?: boolean;
	}

	let { area, children, framed = false }: Props = $props();

	/*
	 * App glue for SurfaceShell (DESIGN.md §11 P1): the module gets routes as props, this file
	 * knows the navigation. The grid sign leads straight to the start page (issue #45).
	 */
	let entry = $derived(areaFor(area));
</script>

<svelte:head>
	<title>{entry.label} | Tutor</title>
</svelte:head>

<SurfaceShell.Root tone={entry.surface}>
	<SurfaceShell.Bar>
		{#if framed}
			<div class="area-frame bar-frame">{@render barContents()}</div>
		{:else}
			{@render barContents()}
		{/if}
	</SurfaceShell.Bar>
	<SurfaceShell.Body>
		<div class={framed ? 'area-frame area-content' : 'container area-content'}>
			{@render children()}
		</div>
	</SurfaceShell.Body>
</SurfaceShell.Root>

{#snippet barContents()}
	<SurfaceShell.Mark href={resolve(area)} index={areaNumber(area)} heading={!framed}>
		{entry.label}
	</SurfaceShell.Mark>
	<SurfaceShell.Actions>
		<ReadAloud.Trigger />
		<SurfaceShell.Grid href={resolve('/')} />
	</SurfaceShell.Actions>
{/snippet}

<style>
	.area-frame {
		inline-size: min(100%, 52rem);
		margin-inline: auto;
		padding-inline: var(--gutter);
	}

	.bar-frame {
		display: flex;
		padding-inline: 0;
	}

	.bar-frame :global(.shell-mark),
	.bar-frame :global(.shell-actions) {
		padding-inline: var(--gutter);
	}

	.bar-frame :global(.shell-actions) {
		padding-inline-start: 0;
	}

	.area-content.area-frame {
		max-inline-size: none;
		margin-inline: auto;
		padding-block: 0 var(--space-l);
	}
	/* The v1 page column of the old page head, kept until each route's issue (#11–#15) rebuilds it. */
	.area-content {
		display: grid;
		/* One column that never grows past the screen; a long nowrap line cannot widen the page. */
		grid-template-columns: minmax(0, 1fr);
		gap: var(--step-5);
		max-inline-size: 44rem;
		margin-inline: 0;
		padding-block: var(--step-5) var(--step-7);
	}

	.area-content:not(.area-frame) :global(h2) {
		font-size: var(--type-lead);
	}

	.area-content :global(ul:not([class])) {
		display: grid;
		gap: var(--step-1);
		padding-inline-start: 1.1em;
		list-style: '– ';
	}
</style>
