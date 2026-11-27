<script module lang="ts">
	let lastScenario: string | null = null;
</script>

<script lang="ts">
	import { page } from '$app/state';
	import { tutorScenarios } from '$lib/content/tutor';
	import { selectScenario } from '$lib/components/tutor/sessionStore';
	import TutorSession from '$lib/components/tutor/TutorSession.svelte';
	let scenario = $state.raw(tutorScenarios[0]);
	$effect(() => {
		scenario = selectScenario(tutorScenarios, page.url.searchParams, lastScenario);
		lastScenario = scenario.id;
	});
</script>

<svelte:head><title>Tutor · KI selbst bauen</title></svelte:head>

{#key scenario.id}<TutorSession {scenario} active />{/key}
