<script lang="ts">
	import { asset } from '$app/paths';
	import { MOTIFS, motifFallback, motifSrcset, type MotifId } from './motifs';

	let {
		motif,
		sizes,
		alt,
		position,
		priority = false
	}: {
		motif: MotifId;
		sizes: string;
		alt?: string;
		position?: string;
		priority?: boolean;
	} = $props();
</script>

<picture>
	<source type="image/avif" srcset={motifSrcset(motif, 'avif', asset)} {sizes} />
	<source type="image/webp" srcset={motifSrcset(motif, 'webp', asset)} {sizes} />
	<img
		src={asset(motifFallback(motif))}
		width="1024"
		height="1024"
		alt={alt ?? MOTIFS[motif].alt}
		decoding="async"
		fetchpriority={priority ? 'high' : undefined}
		draggable="false"
		style:object-position={position ?? MOTIFS[motif].position}
	/>
</picture>

<style>
	picture {
		display: block;
		inline-size: 100%;
		block-size: 100%;
	}

	img {
		display: block;
		inline-size: 100%;
		block-size: 100%;
		object-fit: cover;
	}
</style>
