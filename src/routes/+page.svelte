<script lang="ts">
	import { getTutorAppContext } from '$lib/api/context.svelte';
	import HomeGrid from '$lib/components/home/HomeGrid.svelte';
	import { learningMemory } from '$lib/memory/runtime.svelte';

	const tutorApp = getTutorAppContext();
	let mode = $derived(tutorApp.switching ? 'http' : tutorApp.config.mode);
</script>

<svelte:head>
	<title>Tutor</title>
</svelte:head>

<h1 class="visually-hidden">Tutor</h1>

{#key mode}
	<HomeGrid
		{mode}
		todayDone={tutorApp.todayCompleted}
		todayPlanned={tutorApp.todayTarget}
		onHomeSignal={learningMemory.recordHomeSignal}
	/>
{/key}
