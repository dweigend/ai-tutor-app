<script lang="ts">
	import { asset } from '$app/paths';
	import type { Asset } from '$app/types';
	import { MOTIFS, MotifImage, type MotifId } from '$lib/art';
	import type { ArtImage } from '$lib/content';

	let { art, priority = false }: { art: ArtImage; priority?: boolean } = $props();
	function isMotif(id: string | undefined): id is MotifId {
		return id !== undefined && Object.hasOwn(MOTIFS, id);
	}
</script>

<div class="magazin-motif">
	{#if isMotif(art.tile)}
		<MotifImage
			motif={art.tile}
			alt={art.alt}
			position={art.position}
			{priority}
			sizes="(min-width: 40rem) 40rem, 100vw"
		/>
	{:else}
		<img
			src={asset(art.src as Asset)}
			alt={art.alt}
			width="800"
			height="600"
			loading={priority ? 'eager' : 'lazy'}
			fetchpriority={priority ? 'high' : undefined}
			decoding="async"
			style:object-position={art.position}
		/>
	{/if}
</div>

<style>
	.magazin-motif {
		aspect-ratio: 4 / 3;
	}

	img {
		display: block;
		inline-size: 100%;
		block-size: 100%;
		object-fit: cover;
	}
</style>
