<script lang="ts">
	import { getTutorAppContext } from '$lib/api/context.svelte';
	import HomeGrid from '$lib/components/home/HomeGrid.svelte';
	import { practice } from '$lib/components/uebungen/practice.svelte';
	import { learningMemory } from '$lib/memory/runtime.svelte';

	const tutorApp = getTutorAppContext();
</script>

<svelte:head>
	<title>Tutor</title>
</svelte:head>

<h1 class="visually-hidden">Tutor</h1>

<HomeGrid
	todayDone={tutorApp.todayCompleted}
	todayPlanned={tutorApp.todayTarget}
	doneTasks={practice.done}
	onHomeSignal={learningMemory.recordHomeSignal}
/>
