<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { getTutorAppContext } from '$lib/api/context.svelte';
	import Whiteboard from '$lib/components/whiteboard/Whiteboard.svelte';
	import { fromSnapshot } from '$lib/components/whiteboard/strokes';
	import { tutorScenarios } from '$lib/content/tutor';
	import { exerciseForTask } from '$lib/content/uebungen';
	import { IconButton } from '$lib/modules';

	const tutorApp = getTutorAppContext();
	let board = $state<ReturnType<typeof Whiteboard>>();

	// Coming from a whiteboard exercise, the sketch goes back to that task.
	// The static build has no query parameters; resolve them only in the browser.
	let params = $derived(browser ? page.url.searchParams : null);
	let exercise = $derived(
		params?.get('returnTo') === 'uebungen' ? exerciseForTask(params.get('task')) : undefined
	);
	let returnTask = $derived(exercise?.task.taskId);
	let returnScenario = $derived(
		tutorScenarios.find((entry) => entry.id === params?.get('scenario'))
	);

	// The live tutor asks within the scenario that sent the learner here, else the first one.
	let task = $derived(exercise?.task ?? (returnScenario ?? tutorScenarios[0]).task);
	let boardKey = $derived(returnTask ? `exercise:${returnTask}` : returnScenario?.id);

	// The sketch kept for that task or scenario comes back onto the board, once.
	$effect(() => {
		const target = board;
		if (!target) return;
		untrack(() => {
			const kept = returnTask
				? tutorApp.getExerciseWhiteboard(returnTask)
				: returnScenario && tutorApp.getPendingWhiteboard(returnScenario.id);
			if (kept) target.load(fromSnapshot(kept));
		});
	});

	/** Closing hands the board back as it stands; an empty board clears what was kept. */
	function leave() {
		const snapshot = board?.current() ?? null;
		if (returnTask) {
			tutorApp.setExerciseWhiteboard(returnTask, snapshot);
			void goto(`${resolve('/uebungen')}?task=${encodeURIComponent(returnTask)}`);
			return;
		}
		if (returnScenario) {
			tutorApp.setPendingWhiteboard(returnScenario.id, snapshot);
			void goto(`${resolve('/tutor')}?scenario=${encodeURIComponent(returnScenario.id)}`);
		}
	}
</script>

<svelte:head>
	<title>Whiteboard | Tutor</title>
</svelte:head>

{#key boardKey}
	<Whiteboard bind:this={board} client={tutorApp.client} {task}>
		{#snippet top()}
			{#if returnTask || returnScenario}
				<IconButton
					icon="arrow-left"
					label={returnTask ? 'Zurück zur Aufgabe' : 'Zurück zum Tutor'}
					onclick={leave}
				/>
			{/if}
		{/snippet}
	</Whiteboard>
{/key}
