<script lang="ts">
	import type { WhiteboardSnapshot } from '$lib/api/types';

	interface Props {
		snapshot: WhiteboardSnapshot;
		/** Accessible name; without it the preview is decorative. */
		label?: string;
	}

	let { snapshot, label }: Props = $props();

	// Snapshot points are normalised to 0–1; the preview scales them onto a 100-unit square.
	const SCALE = 100;

	let lines = $derived(
		snapshot.strokes.map((stroke) =>
			stroke.points.map((point) => `${point.x * SCALE},${point.y * SCALE}`).join(' ')
		)
	);
</script>

<svg
	class="sketch"
	viewBox="0 0 {SCALE} {SCALE}"
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
>
	{#each lines as points, index (index)}
		{#if points.includes(' ')}
			<polyline {points} />
		{:else}
			{@const [x, y] = points.split(',')}
			<circle cx={x} cy={y} r="1.2" />
		{/if}
	{/each}
</svg>

<style>
	.sketch {
		display: block;
		inline-size: 100%;
		block-size: 100%;
		background: var(--palette-white);
	}

	polyline {
		fill: none;
		stroke: var(--palette-ink);
		stroke-width: 1.5;
		stroke-linecap: round;
		stroke-linejoin: round;
		vector-effect: non-scaling-stroke;
	}

	circle {
		fill: var(--palette-ink);
	}
</style>
