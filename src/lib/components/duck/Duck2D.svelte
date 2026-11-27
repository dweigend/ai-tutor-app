<script lang="ts">
	import { asset } from '$app/paths';
	import { duckClip, type DuckPose } from '$lib/figures';
	let { pose }: { pose: DuckPose } = $props();
	const clip = $derived(duckClip(pose));
	const still = $derived(clip === 'look_around' ? 'idle' : clip);
</script>

<!-- The 2D still is rendered from the same GLB as the 3D duck, in its everyday look. Nothing is
     drawn on top of it, so a route on the fallback shows exactly the duck of the next route. -->
<span class="duck-2d">
	<img
		src={asset(`/art/duck-fallback/${still}.webp`)}
		width="512"
		height="512"
		alt=""
		draggable="false"
	/>
</span>

<style>
	.duck-2d {
		display: block;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}
	img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		display: block;
	}
</style>
