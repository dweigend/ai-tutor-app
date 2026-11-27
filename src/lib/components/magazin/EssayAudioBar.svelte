<script lang="ts">
	import { onMount } from 'svelte';
	import { Icon } from '$lib/modules';
	import { getReadAloudContext, getScopeContext } from '$lib/modules/read-aloud/context';

	let { readingMinutes }: { readingMinutes: number } = $props();

	const readAloud = getReadAloudContext();
	const scope = getScopeContext()?.id ?? null;
	const id = $props.id();
	let ready = $state(false);
	onMount(() => {
		ready = true;
	});

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
	<button
		type="button"
		class="essay-play"
		aria-label={playing ? 'Vorlesen pausieren' : 'Essay vorlesen'}
		aria-describedby={ready && !available ? `${id}-voice` : undefined}
		disabled={!available}
		onclick={() => readAloud?.controller.toggle(scope)}
	>
		<Icon name={playing ? 'pause' : 'play'} />
	</button>
	<div class="essay-audio-info">
		<p class="audio-label">{playing ? 'Pause' : 'Vorlesen'}</p>
		<p class="audio-length">
			{readingMinutes} min Lesezeit{#if available && lastSegment > 0}
				<span> · Absatz {lastSegment} von {segments.length}</span>
			{/if}
		</p>
		{#if ready && !available}
			<p class="audio-length" id="{id}-voice" role="status">
				Dieser Browser bietet keine lokale deutsche Vorlesestimme an.
			</p>
		{/if}
	</div>
</div>

<style>
	.essay-audio {
		display: flex;
		align-items: center;
		gap: var(--step-3);
		padding-inline: var(--gutter);
	}

	.essay-play {
		display: grid;
		flex: none;
		place-items: center;
		inline-size: var(--control);
		block-size: var(--control);
		border: var(--hairline-width) solid var(--mark-border);
		border-radius: 50%;
		background: var(--mark);
		color: var(--mark-text);
		cursor: pointer;
	}

	.essay-play:disabled {
		background: var(--well);
		border-color: var(--hairline);
		color: var(--text-muted);
		cursor: default;
	}

	.essay-play:focus-visible {
		outline: var(--focus-width) solid var(--focus);
		outline-offset: var(--focus-width);
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
