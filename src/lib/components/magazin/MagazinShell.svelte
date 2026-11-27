<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { SurfaceShell } from '$lib/modules';
	import { areaNumber } from '$lib/navigation';
	import { followSurfaceBelow, type Surface } from '$lib/styles/surface';

	interface Props {
		/** Surface of the opener at the top; the bar shares it until the paper text reaches it. */
		tone: Surface;
		/** The bar mark is the h1 only where the screen has no main heading of its own. */
		markHeading?: boolean;
		/** Document title. */
		title: string;
		children: Snippet;
	}

	let { tone, markHeading = true, title, children }: Props = $props();

	/*
	 * SurfaceShell for /magazin (DESIGN.md §11 P1), like AreaShell but with two differences the
	 * magazine needs: the article's lead question is the page's h1, and the bar takes the surface
	 * right below it, so the coloured opener and the paper text switch hard at the bar and the
	 * browser bar follows (surface.ts, art direction V2-5).
	 */
	let host = $state<HTMLElement>();
	let below = $state<Surface | null>(null);
	let current = $derived(below ?? tone);

	$effect(() => {
		const bar = host?.querySelector<HTMLElement>('.shell-bar');
		if (!bar) return;
		return followSurfaceBelow(
			document,
			() => bar.getBoundingClientRect().bottom,
			(surface) => (below = surface)
		);
	});
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<div class="magazin-shell" bind:this={host}>
	<SurfaceShell.Root tone={current}>
		<SurfaceShell.Bar>
			<SurfaceShell.Mark
				href={resolve('/magazin')}
				index={areaNumber('/magazin')}
				heading={markHeading}
			>
				Magazin
			</SurfaceShell.Mark>
			<SurfaceShell.Actions>
				<SurfaceShell.Grid href={resolve('/')} />
			</SurfaceShell.Actions>
		</SurfaceShell.Bar>
		<SurfaceShell.Body>
			{@render children()}
		</SurfaceShell.Body>
	</SurfaceShell.Root>
</div>

<style>
	.magazin-shell {
		display: contents;
	}
</style>
