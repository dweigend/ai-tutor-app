<script lang="ts">
	import { untrack } from 'svelte';
	import { getTutorAppContext } from '$lib/api/context.svelte';
	import { BoardCanvas, IconButton } from '$lib/modules';
	import {
		INKS,
		MAX_POINTS,
		countPoints,
		fromSnapshot,
		toSnapshot,
		type Stroke
	} from '$lib/components/whiteboard/strokes';

	interface Props {
		/** The task the sketch answers; the sketch is kept per task in the app context. */
		taskId: string;
		disabled?: boolean;
	}

	let { taskId, disabled = false }: Props = $props();

	const tutorApp = getTutorAppContext();
	const boardId = untrack(() => `uebung-${taskId}`);
	const kept = untrack(() => tutorApp.getExerciseWhiteboard(taskId));

	let strokes = $state.raw<Stroke[]>(kept ? fromSnapshot(kept) : []);
	let revision = kept?.revision ?? 0;
	let history = $state.raw<Stroke[][]>([]);
	let tool = $state<'pen' | 'eraser'>('pen');
	let status = $state('');
	let points = $derived(countPoints(strokes));

	/* Every change is the answer at once: the stage reads it from the app context. */
	function save(next: Stroke[]) {
		strokes = next;
		revision += 1;
		tutorApp.setExerciseWhiteboard(
			taskId,
			next.length ? toSnapshot(next, boardId, revision) : null
		);
	}

	function remember() {
		history = [...history.slice(-49), strokes];
	}

	function undo() {
		const previous = history.at(-1);
		if (!previous) return;
		history = history.slice(0, -1);
		save(previous);
		status = 'Zurück.';
	}

	function keydown(event: KeyboardEvent) {
		if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
			event.preventDefault();
			undo();
		}
	}
</script>

<!--
	Sketch answer (V4-5): the board lies directly in the stage, no hand-over to the whiteboard. A clean
	white drawing field on paper, no frame; one quiet row of round tools under it, as on /whiteboard:
	pen, eraser, undo.
-->
<div class="sketch" data-disabled={disabled || undefined} inert={disabled}>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="sketch-board" data-surface="white" onkeydown={keydown}>
		<BoardCanvas
			{strokes}
			{tool}
			color={INKS[0].color}
			pointBudget={MAX_POINTS - points}
			undoShortcut
			onbeforechange={remember}
			onchange={save}
			onlimit={() => (status = 'Fläche voll – radiere etwas weg.')}
			onstatus={(message) => (status = message)}
		/>
	</div>
	<div class="sketch-tools" role="toolbar" aria-label="Zeichnen">
		<IconButton icon="pen" label="Stift" active={tool === 'pen'} onclick={() => (tool = 'pen')} />
		<IconButton
			icon="eraser"
			label="Radierer"
			active={tool === 'eraser'}
			onclick={() => (tool = 'eraser')}
		/>
		<IconButton icon="undo" label="Rückgängig" disabled={history.length === 0} onclick={undo} />
	</div>
	<p class="visually-hidden" aria-live="polite">{status}</p>
</div>

<style>
	/* The drawing field is as wide as the reading column: flush with the question, never wider. */
	.sketch {
		display: grid;
		grid-template-rows: minmax(12rem, 1fr) auto;
		gap: var(--space-s);
		box-sizing: border-box;
		inline-size: 100%;
		max-inline-size: calc(var(--exercise-rail) + 2 * var(--gutter));
		block-size: 100%;
		margin-inline: auto;
		padding-inline: var(--gutter);
	}

	.sketch-board {
		position: relative;
		min-block-size: 12rem;
		overflow: hidden;
		border: 0;
		--board-height: 100%;
		--board-help-inset: var(--space-s);
	}

	.sketch-tools {
		display: flex;
		flex-wrap: nowrap;
		justify-content: center;
		align-items: center;
		gap: var(--space-s);
		min-block-size: var(--hit);
	}
</style>
