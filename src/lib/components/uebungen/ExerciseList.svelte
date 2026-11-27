<script lang="ts">
	import { resolve } from '$app/paths';
	import { getTutorAppContext } from '$lib/api/context.svelte';
	import { Icon, PageHead, SurfaceShell, SwipeRow } from '$lib/modules';
	import { exerciseHref, openExercises } from './course';
	import { practice, resetPractice, settleSwipe, swiped, unswiped } from './practice.svelte';
	import { exerciseIcon, listTitle, visibleInMode } from './stage-model';

	let { swipeable = true }: { swipeable?: boolean } = $props();

	const listHref = resolve('/uebungen');
	const tutorApp = getTutorAppContext();
	/* Live, the locked Modul-2 test split stays out of the list (AP6); the demo shows all nine. */
	const inMode = ({ exercise }: { exercise: { task: { taskId: string } } }) =>
		visibleInMode(exercise.task.taskId, tutorApp.config.mode);
	let remaining = $derived(openExercises(practice.done).filter(inMode));
	let visible = $derived(
		openExercises(practice.done, practice.hidden, practice.later).filter(inMode)
	);
	let page = $state<HTMLElement>();

	/* Cards take turns in a small, fixed set of grounds (reference R6); the exercise orange leads. */
	const TONES: readonly SurfaceShell.Surface[] = ['orange', 'yellow', 'white', 'ink'];

	$effect(() => () => settleSwipe());

	function focusHeading() {
		const heading = page?.querySelector<HTMLHeadingElement>('h1');
		if (!heading) return;
		heading.tabIndex = -1;
		heading.focus();
	}

	function restart() {
		resetPractice();
		focusHeading();
	}

	function restoreHidden() {
		practice.hidden = [];
		focusHeading();
	}
</script>

<SurfaceShell.Root tone="paper">
	<div class="exercise-page" bind:this={page}>
		<PageHead accent="exercise" title="Übungen" />

		<div class="exercise-list">
			{#if visible.length}
				<!--
					Stacked cards (R6): each card overlaps the rounded foot of the one before. The whole card
					is the link; no numbers, no arrow keys.
				-->
				<ol class="exercise-cards" role="list" aria-label="Offene Aufgaben">
					{#each visible as { exercise }, index (`${exercise.task.taskId}:${practice.generations[exercise.task.taskId] ?? 0}`)}
						{@const id = exercise.task.taskId}
						{@const title = listTitle(exercise)}
						{#snippet card()}
							<a class="exercise-card" href={exerciseHref(listHref, id)}>
								<span class="exercise-sign" aria-hidden="true">
									<Icon name={exerciseIcon(exercise)} size={20} />
								</span>
								<span class="exercise-meta">{exercise.subtitle}</span>
								<span class="exercise-title">{title}</span>
								<span class="exercise-time">{exercise.minutes} min</span>
							</a>
						{/snippet}
						<li data-surface={TONES[index % TONES.length]}>
							{#if swipeable}
								<SwipeRow
									flush
									name={title}
									onaction={(action) => swiped(id, action)}
									onundo={() => unswiped(id)}
								>
									{@render card()}
								</SwipeRow>
							{:else}
								{@render card()}
							{/if}
						</li>
					{/each}
				</ol>
			{:else}
				<div class="exercise-empty">
					{#if remaining.length === 0}
						<p>Alles erledigt.</p>
						<button class="m-hit m-key list-action" type="button" onclick={restart}>
							Nochmal von vorn
						</button>
					{:else}
						<p>Alle offenen Aufgaben sind ausgeblendet.</p>
						<button class="m-hit m-key list-action" type="button" onclick={restoreHidden}>
							Einblenden
						</button>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</SurfaceShell.Root>

<style>
	.exercise-list {
		max-inline-size: calc(var(--exercise-rail) + 2 * var(--gutter));
		margin-inline: auto;
		padding: var(--space-m) var(--gutter) var(--duck-clearance);
	}

	.exercise-page :global(h1:focus) {
		outline: none;
	}

	.exercise-cards {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	/* A card covers the rounded foot of the card before it; later cards lie on top. */
	.exercise-cards li {
		position: relative;
		background: transparent;
	}

	.exercise-cards li + li {
		margin-block-start: calc(-1 * var(--radius-option));
	}

	.exercise-cards li:focus-within {
		z-index: 1;
	}

	.exercise-cards li :global(.swipe-track) {
		border-radius: var(--radius-option);
	}

	.exercise-cards li :global(.swipe-row .swipe-cell) {
		background: transparent;
	}

	.exercise-cards :global(.swipe-undo) {
		border-radius: var(--radius-option);
		padding-block-end: var(--radius-option);
	}

	.exercise-card {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: var(--step-1);
		min-block-size: calc(7rem + var(--radius-option));
		padding: var(--space-m) var(--space-m) calc(var(--space-m) + var(--radius-option));
		border-radius: var(--radius-option);
		background: var(--surface);
		color: var(--text);
		text-decoration: none;
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
	}

	.exercise-cards li:last-child .exercise-card {
		min-block-size: 7rem;
		padding-block-end: var(--space-m);
	}

	.exercise-cards li:last-child :global(.swipe-undo) {
		padding-block-end: 0;
	}

	.exercise-card:focus-visible {
		outline: var(--focus-width) solid var(--text);
		outline-offset: calc(-2 * var(--focus-width));
	}

	.exercise-card:active {
		background: var(--action);
		color: var(--action-text);
	}

	/* Format sign (R6): one quiet stroke icon in a ring, top right, in the card's own ink. */
	.exercise-sign {
		display: grid;
		grid-row: 1 / span 2;
		grid-column: 2;
		place-items: center;
		inline-size: 2.5rem;
		block-size: 2.5rem;
		border: var(--hairline-width) solid currentColor;
		border-radius: 50%;
	}

	.exercise-meta,
	.exercise-title,
	.exercise-time {
		grid-column: 1;
	}

	.exercise-meta,
	.exercise-time {
		font-size: var(--type-meta);
		line-height: var(--line-meta);
	}

	.exercise-title {
		font-size: var(--type-question);
		line-height: var(--line-question);
		font-weight: var(--font-weight-regular);
		letter-spacing: var(--letter-question);
		overflow-wrap: anywhere;
	}

	.exercise-time {
		align-self: end;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.exercise-empty {
		display: grid;
		justify-items: start;
		gap: var(--space-s);
	}

	.exercise-empty p {
		margin: 0;
	}

	.list-action {
		min-block-size: var(--control);
		padding-inline: var(--space-m);
		border-radius: var(--radius-pill);
	}
</style>
