<script lang="ts">
	import { asset } from '$app/paths';
	import type { Asset } from '$app/types';
	import { MOTIFS, MotifImage, type MotifId } from '$lib/art';
	import type { ArtImage } from '$lib/content';

	let {
		art,
		priority = false,
		decorative = false,
		sizes = '(min-width: 54rem) 22rem, (min-width: 40rem) 46vw, 86vw'
	}: {
		art: ArtImage;
		priority?: boolean;
		decorative?: boolean;
		sizes?: string;
	} = $props();
	function isMotif(id: string | undefined): id is MotifId {
		return id !== undefined && Object.hasOwn(MOTIFS, id);
	}
</script>

<div class="magazin-motif" class:monochrome={art.tile === 'essay-lernstand'} data-media="bleed">
	{#if isMotif(art.tile)}
		<MotifImage
			motif={art.tile}
			alt={decorative ? '' : art.alt}
			position={art.position}
			{priority}
			{sizes}
		/>
	{:else}
		<img
			src={asset(art.src as Asset)}
			alt={decorative ? '' : art.alt}
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
		position: absolute;
		inset: 0;
	}

	.monochrome {
		filter: grayscale(1);
	}

	img {
		display: block;
		inline-size: 100%;
		block-size: 100%;
		object-fit: cover;
	}
</style>
