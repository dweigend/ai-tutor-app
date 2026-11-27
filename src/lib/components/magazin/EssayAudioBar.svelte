<script lang="ts">
	import { IconButton } from '$lib/modules';
	import { getReadAloudContext, getScopeContext } from '$lib/modules/read-aloud/context';

	let { readingMinutes }: { readingMinutes: number } = $props();

	const readAloud = getReadAloudContext();
	const scope = getScopeContext()?.id ?? null;
	let segments = $derived(readAloud?.state.segments.filter((part) => part.scope === scope) ?? []);
	let playing = $derived(readAloud?.state.status === 'speaking' && readAloud.state.scope === scope);
	let segmentIndex = $derived(
		segments.findIndex((segment) => segment.id === readAloud?.state.activeId)
	);
	let lastSegment = $state(0);
	$effect(() => {
		if (segmentIndex >= 0) lastSegment = segmentIndex + 1;
	});

	let available = $derived(Boolean(readAloud?.state.available && segments.length));
</script>

<div class="essay-audio">
	<IconButton
		icon={playing ? 'pause' : 'play'}
		label={playing ? 'Vorlesen pausieren' : 'Essay vorlesen'}
		size="lg"
		class="essay-play"
		disabled={!available}
		onclick={() => readAloud?.controller.toggle(scope)}
	/>
	<div class="essay-audio-info">
		<p class="audio-label">{playing ? 'Pause' : 'Vorlesen'}</p>
		<p class="audio-length">
			{readingMinutes} min{#if available && lastSegment > 0}
				<span> · Absatz {lastSegment} von {segments.length}</span>
			{/if}
		</p>
	</div>
</div>

<style>
	.essay-audio {
		display: flex;
		align-items: center;
		gap: var(--space-s);
	}

	.essay-audio :global(.essay-play:disabled) {
		background: var(--text-muted);
		color: var(--card);
	}

	.essay-audio-info {
		display: grid;
		gap: var(--step-1);
	}

	.audio-label,
	.audio-length {
		margin: 0;
	}

	.audio-label {
		font-weight: var(--font-weight-strong);
	}

	.audio-length {
		color: var(--text-muted);
		font-size: var(--type-label);
		font-variant-numeric: tabular-nums;
	}
</style>
