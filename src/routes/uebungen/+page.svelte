<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import ExerciseList from '$lib/components/uebungen/ExerciseList.svelte';
	import ExerciseStage from '$lib/components/uebungen/ExerciseStage.svelte';
	import { listTitle } from '$lib/components/uebungen/stage-model';
	import { exerciseForTask } from '$lib/content/uebungen';

	// The static list is hidden on initial task deep links until the stage has hydrated.
	let active = $derived(
		browser
			? exerciseForTask(page.url.searchParams.get('aufgabe') ?? page.url.searchParams.get('task'))
			: undefined
	);
	$effect(() => {
		delete document.documentElement.dataset.routeStartup;
	});
	const listHref = resolve('/uebungen');
</script>

<svelte:head>
	<meta name="tutor-exercise-startup" content="task" />
	<title>{active ? `${listTitle(active)} | ` : ''}Übungen | Tutor</title>
</svelte:head>

{#if active}
	{#key active.task.taskId}
		<ExerciseStage
			exercise={active}
			{listHref}
			whiteboardHref="{resolve('/whiteboard')}?returnTo=uebungen&task={encodeURIComponent(
				active.task.taskId
			)}"
		/>
	{/key}
{:else}
	<ExerciseList />
{/if}
