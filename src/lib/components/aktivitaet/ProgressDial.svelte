<script lang="ts">
	interface Props {
		/** Steps completed and planned today, from the same source as the start page. */
		done: number;
		planned: number;
	}

	let { done, planned }: Props = $props();

	let filled = $derived(Math.min(Math.max(Math.floor(done), 0), planned));
	let progress = $derived(planned > 0 ? filled / planned : 0);
</script>

<span class="dial" data-done={filled} data-planned={planned}>
	<svg viewBox="0 0 72 72" aria-hidden="true">
		<circle class="track" cx="36" cy="36" r="32" />
		{#if progress > 0}
			<circle
				class="progress"
				cx="36"
				cy="36"
				r="32"
				pathLength="1"
				stroke-dasharray="{progress} 1"
				transform="rotate(-90 36 36)"
			/>
		{/if}
	</svg>
	<span class="dial-value">{filled} / {planned}</span>
</span>

<style>
	.dial {
		display: grid;
		place-items: center;
		flex: none;
		inline-size: 4.5rem;
		aspect-ratio: 1;
		color: var(--text);
		font: var(--font-weight-strong) var(--type-meta) / var(--line-meta) var(--font-ui);
		font-variant-numeric: tabular-nums;
	}

	svg,
	.dial-value {
		grid-area: 1 / 1;
	}

	svg {
		inline-size: 100%;
		fill: none;
	}

	.track {
		stroke: var(--text-muted);
		stroke-width: var(--hairline-width);
	}

	.progress {
		stroke: var(--mark);
		stroke-width: 4;
		stroke-linecap: round;
	}
</style>
