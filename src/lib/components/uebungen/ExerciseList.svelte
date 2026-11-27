<script lang="ts">
	import { resolve } from '$app/paths';
	import { Icon, SurfaceShell, SwipeRow } from '$lib/modules';
	import { exerciseHref, openExercises } from './course';
	import { practice, resetPractice, settleSwipe, swiped, unswiped } from './practice.svelte';
	import { listTitle } from './stage-model';

	let { swipeable = true }: { swipeable?: boolean } = $props();

	const listHref = resolve('/uebungen');
	let remaining = $derived(openExercises(practice.done));
	let visible = $derived(openExercises(practice.done, practice.hidden, practice.later));
	let heading = $state<HTMLHeadingElement>();

	$effect(() => () => settleSwipe());

	function restart() {
		resetPractice();
		heading?.focus();
	}

	function restoreHidden() {
		practice.hidden = [];
		heading?.focus();
	}
</script>

<SurfaceShell.Root tone="orange">
	<div class="exercise-list">
		<header class="list-head">
			<div class="list-top">
				<span class="m-label">Übungen</span>
				<SurfaceShell.Grid href={resolve('/')} />
			</div>
			<h1 bind:this={heading} tabindex="-1">Neun Versuche am Modell</h1>
		</header>

		{#if visible.length}
			<ol class="exercise-rows" role="list" aria-label="Offene Aufgaben">
				{#each visible as { exercise, number } (`${exercise.task.taskId}:${practice.generations[exercise.task.taskId] ?? 0}`)}
					{@const id = exercise.task.taskId}
					{@const title = listTitle(exercise)}
					{#snippet row()}
						<a class="exercise-row" href={exerciseHref(listHref, id)}>
							<span class="exercise-number" aria-hidden="true">
								{String(number).padStart(2, '0')}
							</span>
							<span>
								<span class="exercise-title">{title}</span>
								<span class="exercise-meta">
									{exercise.subtitle} <span class="exercise-time">· {exercise.minutes} min</span>
								</span>
							</span>
							<span class="exercise-arrow" aria-hidden="true"><Icon name="arrow-right" /></span>
						</a>
					{/snippet}
					<li>
						{#if swipeable}
							<SwipeRow
								flush
								name={title}
								onaction={(action) => swiped(id, action)}
								onundo={() => unswiped(id)}
							>
								{@render row()}
							</SwipeRow>
						{:else}
							{@render row()}
						{/if}
					</li>
				{/each}
			</ol>
		{:else}
			<div class="exercise-empty">
				{#if remaining.length === 0}
					<p>Alle neun Übungen sind erledigt.</p>
					<button class="m-hit m-key list-action" type="button" onclick={restart}>
						Erneut üben
					</button>
				{:else}
					<p>Die offenen Übungen sind ausgeblendet.</p>
					<button class="m-hit m-key list-action" type="button" onclick={restoreHidden}>
						Übungen einblenden
					</button>
				{/if}
			</div>
		{/if}
	</div>
</SurfaceShell.Root>

<style>
	.exercise-list {
		max-inline-size: calc(var(--exercise-rail) + 2 * var(--gutter));
		margin-inline: auto;
		padding-inline: var(--gutter);
		padding-bottom: 96px;
	}

	.list-head {
		padding-block: var(--space-s) var(--space-m);
	}

	.list-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	h1 {
		margin: var(--space-m) 0 0;
		font-size: var(--type-head);
		line-height: var(--line-head);
		font-weight: var(--font-weight-light);
		text-transform: uppercase;
	}

	h1:focus {
		outline: none;
	}

	.exercise-rows {
		margin: 0;
		padding: 0;
		border-block-end: var(--hairline-width) solid var(--hairline);
		list-style: none;
	}

	.exercise-rows li {
		border-block-start: var(--hairline-width) solid var(--hairline);
	}

	.exercise-row {
		display: grid;
		grid-template-columns: minmax(0, 2.5rem) minmax(0, 1fr) var(--arrow-circle-size);
		align-items: center;
		gap: var(--space-s);
		min-block-size: var(--row);
		padding-block: var(--space-s);
		color: inherit;
		text-decoration: none;
		touch-action: manipulation;
	}

	.exercise-row:focus-visible {
		outline: var(--focus-width) solid var(--focus);
		outline-offset: calc(-1 * var(--focus-width));
	}

	.exercise-title,
	.exercise-meta {
		display: block;
	}

	.exercise-title {
		font-size: var(--type-title);
		line-height: var(--line-title);
		font-weight: var(--font-weight-regular);
		overflow-wrap: anywhere;
	}

	.exercise-number,
	.exercise-meta {
		font-size: var(--type-meta);
		line-height: var(--line-meta);
		font-variant-numeric: tabular-nums;
	}

	.exercise-time {
		white-space: nowrap;
	}

	.exercise-arrow {
		display: grid;
		place-items: center;
		inline-size: var(--arrow-circle-size);
		block-size: var(--arrow-circle-size);
		border: var(--hairline-width) solid currentColor;
		border-radius: 50%;
	}

	.exercise-row:active .exercise-arrow {
		color: var(--action-text);
		background: var(--action);
	}

	.exercise-empty {
		border-block-start: var(--hairline-width) solid var(--hairline);
	}

	.list-action {
		min-block-size: var(--control);
		padding-inline: var(--space-m);
		border-radius: var(--radius-pill);
	}
</style>
