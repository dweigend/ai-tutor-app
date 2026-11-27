<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { getTutorAppContext } from '$lib/api/context.svelte';
	import ExerciseList from '$lib/components/uebungen/ExerciseList.svelte';
	import ExerciseStage from '$lib/components/uebungen/ExerciseStage.svelte';
	import { listTitle, openableTaskId, visibleInMode } from '$lib/components/uebungen/stage-model';
	import { exerciseForTask } from '$lib/content/uebungen';

	const tutorApp = getTutorAppContext();
	const listHref = resolve('/uebungen');
	let requested = $derived(
		browser ? (page.url.searchParams.get('aufgabe') ?? page.url.searchParams.get('task')) : null
	);
	/*
	 * The static list is hidden on initial task deep links until the stage has hydrated. Live, a
	 * link to a locked Modul-2 task (AP6) opens no stage; the released list shows instead.
	 */
	let active = $derived(
		browser && !tutorApp.switching
			? exerciseForTask(openableTaskId(page.url.searchParams, tutorApp.config.mode))
			: undefined
	);
	$effect(() => {
		delete document.documentElement.dataset.routeStartup;
	});
	// The address drops a locked task, so reloading or sharing it shows the list as well.
	$effect(() => {
		if (requested && !visibleInMode(requested, tutorApp.config.mode))
			void goto(listHref, { replaceState: true, keepFocus: true });
	});
</script>

<svelte:head>
	<meta name="tutor-exercise-startup" content="task" />
	<title>{active ? `${listTitle(active)} | ` : ''}Übungen | Tutor</title>
</svelte:head>

{#if active}
	{#key active.task.taskId}
		<ExerciseStage exercise={active} {listHref} />
	{/key}
{:else}
	<ExerciseList />
{/if}
