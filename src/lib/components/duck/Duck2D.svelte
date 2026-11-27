<script lang="ts">
	import { asset } from '$app/paths';
	import { duckClip, type DuckPose } from '$lib/figures';
	let { pose }: { pose: DuckPose } = $props();
	const clip = $derived(duckClip(pose));
	const still = $derived(clip === 'look_around' ? 'idle' : clip);
</script>

<img
	src={asset(`/art/duck-fallback/${still}.webp`)}
	width="512"
	height="512"
	alt=""
	draggable="false"
/>

<style>
	img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		display: block;
		pointer-events: none;
	}
</style>
