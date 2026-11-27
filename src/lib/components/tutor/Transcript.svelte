<script lang="ts">
	import { getTutorAppContext } from '$lib/api/context.svelte';
	import { trustedMediaUrl } from '$lib/api/media';
	import { RichText } from '$lib/modules';
	import SketchPreview from './SketchPreview.svelte';
	import TranscriptImage from './TranscriptImage.svelte';
	import {
		rejectedByServer,
		type LearnerEntry,
		type LiveTurn,
		type TranscriptEntry
	} from './types';

	interface Props {
		entries: readonly TranscriptEntry[];
		live: LiveTurn | null;
		onabort: () => void;
		onretry?: () => void;
		ondiscard: () => void;
		onrestart: () => void;
	}

	let { entries, live, onabort, onretry, ondiscard, onrestart }: Props = $props();

	const tutorApp = getTutorAppContext();

	let rejected = $derived(live !== null && rejectedByServer(live));
</script>

{#snippet learner(entry: LearnerEntry, pending: boolean)}
	<li class="entry entry-learner" class:pending>
		<p class="role label">Du</p>
		<div class="body">
			{#if entry.confidence !== undefined || pending}
				<p class="tags">
					{#if entry.confidence !== undefined}
						<span class="data muted">Sicherheit {entry.confidence} %</span>
					{/if}
					{#if pending}<span class="data muted">noch offen</span>{/if}
				</p>
			{/if}
			{#if entry.sketch}
				<div class="sketch">
					<SketchPreview snapshot={entry.sketch} label="Skizze" />
				</div>
			{/if}
			{#if entry.text}
				<p class="text">{entry.text}</p>
			{/if}
		</div>
	</li>
{/snippet}

<ol class="transcript" aria-label="Gesprächsverlauf">
	{#each entries as entry (entry.id)}
		{#if entry.kind === 'learner'}
			{@render learner(entry, false)}
		{:else if entry.kind === 'tutor'}
			<li class="entry entry-tutor">
				<p class="role label">Tutor</p>
				<div class="body">
					<p class="text"><RichText text={entry.text} /></p>
					{#each entry.media as media (media.id)}
						{@const origin = globalThis.location?.origin}
						{@const url = origin && trustedMediaUrl(media.url, origin, tutorApp.config)}
						{#if url}
							<TranscriptImage {url} alt={media.alt} />
						{/if}
					{/each}
				</div>
			</li>
		{:else if entry.kind === 'wait'}
			<li class="entry entry-tutor entry-wait">
				<p class="role label">Tutor</p>
				<div class="body">
					<p class="text muted">Alles klar – ich warte auf deinen nächsten Gedanken.</p>
				</div>
			</li>
		{:else}
			<li class="entry entry-note"><p class="data muted">{entry.text}</p></li>
		{/if}
	{/each}

	{#if live}
		{@render learner(live.learner, true)}
		<li class="entry entry-tutor entry-live" aria-busy={live.status === 'streaming'}>
			<p class="role label">Tutor</p>
			<div class="body">
				{#if live.status === 'streaming'}
					<p class="tags">
						<span class="tag label">{live.text ? 'Schreibt' : 'Denkt'}</span>
						<button type="button" class="abort" onclick={onabort}>Abbrechen</button>
					</p>
					<p class="text"><RichText text={live.text} /></p>
				{:else}
					{#if live.text}<p class="text muted"><RichText text={live.text} /></p>{/if}
					<div class="problem" role="alert">
						<p class="label">
							{live.status === 'aborted' ? 'Abgebrochen' : 'Keine Antwort'}
						</p>
						{#if live.status !== 'aborted'}
							<p>{live.problem?.message ?? 'Gerade keine Antwort.'}</p>
						{/if}
						<div class="problem-actions">
							{#if rejected}
								<button type="button" class="button button-quiet" onclick={ondiscard}>
									Verwerfen
								</button>
							{:else if onretry}
								<button type="button" class="button" onclick={onretry}> Nochmal senden </button>
							{/if}
							<button type="button" class="button button-quiet" onclick={onrestart}>
								Neu starten
							</button>
						</div>
					</div>
				{/if}
			</div>
		</li>
	{/if}
</ol>

<style>
	.transcript {
		display: grid;
		padding: 0;
		border-block-start: var(--hairline-width) solid var(--hairline);
		list-style: none;
	}

	.entry {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--step-2);
		padding-block: var(--step-4);
		border-block-end: var(--hairline-width) solid var(--hairline);
	}

	.role {
		font-family: var(--font-mono);
		letter-spacing: 0.12em;
	}

	.body {
		display: grid;
		gap: var(--step-2);
		min-inline-size: 0;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--step-2);
	}

	.tag {
		padding: 0.1rem var(--step-2);
		border: var(--hairline-width) solid var(--hairline);
	}

	.text {
		max-inline-size: 36rem;
		white-space: pre-line;
	}

	.entry-tutor .text {
		font-size: var(--type-body);
		line-height: var(--line-body);
	}

	/* Learner and tutor lines on the same surface, separated by hairlines only. */

	.entry-learner.pending .text {
		color: var(--text-muted);
	}

	.sketch {
		inline-size: 6rem;
		block-size: 6rem;
		border: var(--hairline-width) solid var(--hairline);
	}

	.entry-note {
		padding-block: var(--step-2);
	}

	.abort {
		min-block-size: 2.75rem;
		margin-inline-start: auto;
		padding: 0 var(--step-3);
		border: var(--hairline-width) solid var(--hairline);
		background: transparent;
		color: var(--text);
		font-family: var(--font-mono);
		font-size: var(--type-label);
		cursor: pointer;
	}

	.problem {
		display: grid;
		gap: var(--step-2);
		padding: var(--step-3) var(--step-4);
		border-inline-start: var(--edge-width) solid var(--palette-signal-crimson);
	}

	.problem-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--step-2);
	}

	@media (min-width: 640px) {
		.entry {
			grid-template-columns: 4.5rem minmax(0, 1fr);
			gap: var(--step-4);
		}

		.entry-note {
			grid-template-columns: minmax(0, 1fr);
			padding-inline-start: calc(4.5rem + var(--step-4));
		}

		.role {
			padding-block-start: 0.2rem;
		}
	}
</style>
