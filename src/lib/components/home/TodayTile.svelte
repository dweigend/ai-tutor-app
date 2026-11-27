<script lang="ts">
	import Tile from '$lib/components/Tile.svelte';
	import { todayProgress } from './progress';

	interface Props {
		done: number;
		planned: number;
		href?: string;
		area?: string;
	}

	let { done, planned, href, area }: Props = $props();
	let progress = $derived(todayProgress(done, planned));
</script>

<Tile tone="paper" {href} {area} ariaLabel={progress.label}>
	<span class="today">
		<span class="category">Heute</span>
		<span class="title">Tagesprogramm</span>
		<span class="count"><strong>{progress.completed}</strong> von {progress.target} erledigt</span>
		<progress aria-label={progress.label} max={progress.target || 1} value={progress.completed}
		></progress>
	</span>
</Tile>

<style>
	.today {
		display: grid;
		align-content: end;
		gap: 0.35rem;
		inline-size: 100%;
		block-size: 100%;
		font-family: var(--font-ui);
	}

	.category {
		color: var(--text-muted);
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.035em;
		text-transform: uppercase;
	}

	.title {
		font-size: clamp(1.125rem, 2.4vw, 1.75rem);
		font-weight: 650;
		line-height: 1.12;
		letter-spacing: -0.025em;
	}

	.count {
		color: var(--text-muted);
		font-size: 0.875rem;
		font-variant-numeric: tabular-nums;
	}

	.count strong {
		color: var(--text);
		font-size: clamp(1.5rem, 3.6vw, 3rem);
		font-weight: 650;
		line-height: 1;
	}

	progress {
		appearance: none;
		inline-size: 100%;
		block-size: 0.5rem;
		overflow: hidden;
		margin-block-start: 0.3rem;
		border: 1px solid var(--text-muted);
		border-radius: var(--radius-pill);
		background: var(--well);
	}

	progress::-webkit-progress-bar {
		background: var(--well);
	}

	progress::-webkit-progress-value {
		background: var(--mark);
		box-shadow: inset -1px 0 var(--mark-border);
	}

	progress::-moz-progress-bar {
		background: var(--mark);
		box-shadow: inset -1px 0 var(--mark-border);
	}

	/* On a phone the tile may reach below the fold: label, count and bar stand at its top. */
	@media (max-width: 47.999rem) {
		.today {
			align-content: start;
		}
	}

	@media (forced-colors: active) {
		progress {
			appearance: auto;
		}
	}
</style>
