<script module lang="ts">
	let lastScenario: string | null = null;
	/** Where pulling the fullscreen duck down leads: the page the learner came from. */
	let returnTo: string | null = null;
</script>

<script lang="ts">
	import { afterNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { tutorScenarios } from '$lib/content/tutor';
	import { selectScenario } from '$lib/components/tutor/sessionStore';
	import TutorSession from '$lib/components/tutor/TutorSession.svelte';
	let scenario = $state.raw(tutorScenarios[0]);
	$effect(() => {
		scenario = selectScenario(tutorScenarios, page.url.searchParams, lastScenario);
		lastScenario = scenario.id;
	});
	// Switching the scenario stays on /tutor and keeps the way back.
	afterNavigate(({ from }) => {
		if (from && from.route.id !== '/tutor') returnTo = from.url.pathname + from.url.search;
	});
	function leave() {
		void goto(returnTo ?? resolve('/'));
	}
</script>

<svelte:head><title>Tutor</title></svelte:head>

{#key scenario.id}<TutorSession {scenario} active onleave={leave} />{/key}
