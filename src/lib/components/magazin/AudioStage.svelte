<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { screenContext } from '$lib/memory/runtime.svelte';
	import type { EditorialEpisode } from '$lib/content';
	import { Fader, Fold, Icon, InteractionStage, Readout, type IconName } from '$lib/modules';
	import {
		MATRIX_COLUMNS,
		MATRIX_ROWS,
		buildTimeline,
		columnDetents,
		columnStart,
		createPlayer,
		formatClock,
		matrixCell,
		matrixFrame,
		paragraphAt,
		scriptParagraphs,
		segmentAt,
		spokenClock
	} from './player';

	interface Props {
		episode: EditorialEpisode;
		/** Where the close sign and Escape lead: the podcast row of the overview. */
		closeHref: string;
	}

	let { episode, closeHref }: Props = $props();

	/* The page is keyed by slug, so one player lives exactly as long as this stage. */
	const timeline = untrack(() => buildTimeline(episode));
	const player = createPlayer(timeline);
	const detents = columnDetents(timeline.duration);

	let playback = $state(player.getState());
	$effect(() => player.subscribe((next) => (playback = next)));
	// Leaving the route stops the clock: no interval outlives the stage.
	$effect(() => () => player.dispose());

	/* The matrix is the time axis: while the finger is on it, it shows where it would land. */
	let scrubbing = $state(false);
	let grip = $state(0);
	let committed = $state(0);
	let shown = $derived(scrubbing ? grip : playback.position);
	let frame = $derived(matrixFrame(shown, timeline.duration));
	let paused = $derived(playback.thinking !== null);
	let lit = $derived((column: number, row: number) => matrixCell(frame, column, row, paused));

	$effect(() => {
		const position = playback.position;
		if (untrack(() => scrubbing)) return;
		grip = position;
		committed = columnStart(matrixFrame(position, timeline.duration).played, timeline.duration);
	});

	function commit(value: number) {
		scrubbing = false;
		player.seek(value);
	}

	let current = $derived(segmentAt(timeline.segments, shown));
	let chapterIndex = $derived(segmentAt(timeline.segments, playback.position).index);
	let paragraphs = $derived(scriptParagraphs(current.script));
	let active = $derived(paragraphAt(current, shown));
	let asking = $derived(
		playback.thinking ? timeline.segments[playback.thinking.segment] : undefined
	);

	// Observe the committed chapter, independently of scrubbing and ticks within the chapter.
	$effect(() => {
		const context = {
			route: page.url.pathname,
			topic: episode.kicker,
			media: {
				kind: 'audio' as const,
				id: episode.id,
				title: episode.title,
				chapter: timeline.segments[chapterIndex].title
			}
		};
		untrack(() => screenContext.setScreen(context));
	});

	let keyWord = $derived(paused ? 'Weiter' : playback.playing ? 'Pause' : 'Abspielen');
	let keyIcon: IconName = $derived(playback.playing && !paused ? 'pause' : 'play');

	/* Screen readers hear the start and end of a thinking pause once, not every tick. */
	let announcement = $state('');
	let wasThinking = false;
	$effect(() => {
		const thinking = asking;
		if (thinking && !wasThinking) {
			announcement = `Denkpause, ${thinking.pauseSeconds} Sekunden: ${thinking.listenerPrompt}`;
		} else if (!thinking && wasThinking) {
			announcement = 'Denkpause vorbei, es geht weiter.';
		}
		wasThinking = Boolean(thinking);
	});

	/* Chapters and sources stay closed; one fold at a time lies over the instrument. */
	let chaptersOpen = $state(false);
	let sourcesOpen = $state(false);
	let foldOpen = $derived(chaptersOpen || sourcesOpen);
	$effect(() => {
		if (chaptersOpen) untrack(() => (sourcesOpen = false));
	});
	$effect(() => {
		if (sourcesOpen) untrack(() => (chaptersOpen = false));
	});

	let stageElement = $state<HTMLElement>();
	async function closeFolds() {
		const trigger = chaptersOpen ? '.audio-fold-start' : '.audio-fold-end';
		chaptersOpen = false;
		sourcesOpen = false;
		await tick();
		stageElement?.querySelector<HTMLElement>(`${trigger} > .fold-trigger`)?.focus();
	}

	function exit() {
		if (foldOpen) {
			void closeFolds();
			return;
		}
		void goto(closeHref);
	}

	function jump(seconds: number) {
		player.seek(seconds);
		void closeFolds();
	}

	/* The live transcript keeps the spoken paragraph in view, with a hard jump, never a glide. */
	let transcript = $state<HTMLElement>();
	$effect(() => {
		void active;
		void current;
		transcript?.querySelector('[data-active]')?.scrollIntoView({ block: 'nearest' });
	});
</script>

<div class="audio-host" bind:this={stageElement}>
	<InteractionStage.Root
		state="open"
		surface="ink"
		label="Podcast: {episode.title}"
		step={current.index + 1}
		steps={timeline.segments.length}
		onexit={exit}
	>
		<InteractionStage.Meter href={closeHref} />
		<section class="stage-head audio-head">
			<InteractionStage.Context text={episode.title} />
			<InteractionStage.Prompt text={episode.question} />
		</section>

		<Fold.Root
			label="Kapitel"
			count={timeline.segments.length}
			triggerLabel="Kapitel öffnen"
			flat
			class="audio-fold audio-fold-start"
			contentClass="audio-fold-content"
			bind:open={chaptersOpen}
		>
			<ol class="audio-chapters">
				{#each timeline.segments as segment (segment.index)}
					<li>
						<button
							type="button"
							class="audio-chapter"
							data-row
							aria-current={segment.index === current.index ? 'true' : undefined}
							onclick={() => jump(segment.start)}
						>
							<span class="audio-chapter-time">{formatClock(segment.start)}</span>
							<span class="audio-chapter-title">{segment.title}</span>
							<span class="audio-chapter-sign" aria-hidden="true">
								{segment.index === current.index ? '■' : ''}
							</span>
						</button>
					</li>
				{/each}
			</ol>
		</Fold.Root>
		<Fold.Root
			label="Quellen"
			count={episode.sources.length}
			triggerLabel="Quellen öffnen"
			flat
			class="audio-fold audio-fold-end"
			contentClass="audio-fold-content"
			bind:open={sourcesOpen}
		>
			<Fold.SourceList sources={episode.sources} />
		</Fold.Root>

		<InteractionStage.Instrument label="Wiedergabe">
			<div class="audio-instrument" inert={foldOpen}>
				<!-- svelte-ignore a11y_no_static_element_interactions (the Fader inside is the slider; this
				     only notes that a finger is on the matrix, so playback does not pull the grip back) -->
				<div
					class="audio-scrub-host"
					onpointerdown={(event) => {
						// Only the primary button scrubs; a right click never freezes matrix and clock.
						if (event.button === 0) scrubbing = true;
					}}
					onpointerup={() => (scrubbing = false)}
					onpointercancel={() => (scrubbing = false)}
				>
					<Fader.Fader
						min={0}
						max={timeline.duration}
						{detents}
						bind:value={committed}
						bind:position={grip}
						label="Zeitleiste"
						valuetext={(value) =>
							`${spokenClock(value)} von ${spokenClock(timeline.duration)}, ${segmentAt(timeline.segments, value).title}`}
						class="audio-scrub"
						onvaluecommit={commit}
					>
						<Readout.Matrix
							columns={MATRIX_COLUMNS}
							rows={MATRIX_ROWS}
							played={lit}
							label="Fortschritt"
						/>
					</Fader.Fader>
				</div>
				<!-- Only the time: the meter and the chapter fold already count the chapters. -->
				<p class="audio-clock">{formatClock(shown)} / {formatClock(timeline.duration)}</p>
				<div class="audio-transcript" bind:this={transcript}>
					{#if asking}
						<p class="audio-transcript-label">
							Denkpause · weiter in <span class="m-unit">
								{Math.ceil(playback.thinking?.remaining ?? 0)} s
							</span>
						</p>
						<p class="audio-ask">{asking.listenerPrompt}</p>
					{:else}
						<p class="audio-transcript-label">{current.title}</p>
						{#each paragraphs as paragraph, index (index)}
							<p class="audio-line" data-active={index === active || undefined}>{paragraph}</p>
						{/each}
					{/if}
				</div>
			</div>
		</InteractionStage.Instrument>

		<p class="visually-hidden" role="status" aria-live="polite">{announcement}</p>

		<div class="podcast-controls">
			<button type="button" class="podcast-play" aria-label={keyWord} onclick={player.toggle}>
				<Icon name={keyIcon} />
			</button>
		</div>
	</InteractionStage.Root>
</div>

<style>
	.podcast-controls {
		grid-area: action;
		display: grid;
		place-items: center;
	}

	.podcast-play {
		display: grid;
		place-items: center;
		inline-size: var(--control);
		block-size: var(--control);
		border: var(--hairline-width) solid var(--mark-border);
		border-radius: 50%;
		background: var(--mark);
		color: var(--mark-text);
		cursor: pointer;
	}

	.podcast-play:focus-visible {
		outline: var(--focus-width) solid var(--focus);
		outline-offset: var(--focus-width);
	}

	.audio-host :global(.readout-matrix-cell[data-on='false']::before) {
		box-sizing: border-box;
		inline-size: var(--dot);
		block-size: var(--dot);
		border: 1.5px solid var(--text-muted);
		background: transparent;
	}
</style>
