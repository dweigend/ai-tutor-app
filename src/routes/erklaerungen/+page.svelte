<script lang="ts">
	import AreaShell from '$lib/components/AreaShell.svelte';
	import TutorialView from '$lib/components/tutorials/TutorialView.svelte';
	import { tutorials } from '$lib/content/tutorials';
	import { Raster } from '$lib/modules';

	/** Short names for the 44px strip; the full title is the accessible name. */
	const SHORT: Record<string, string> = {
		'attention-skalierung': 'Attention',
		'backprop-zwei-kanten': 'Backprop'
	};

	let activeId = $state(tutorials[0].id);
	let items = $derived(
		tutorials.map((tutorial) => ({
			value: tutorial.id,
			label: SHORT[tutorial.id] ?? tutorial.title.split(':')[0],
			ariaLabel: tutorial.title
		}))
	);
	let active = $derived(tutorials.find((tutorial) => tutorial.id === activeId) ?? tutorials[0]);
</script>

<AreaShell area="/erklaerungen" framed>
	<div class="explain">
		<Raster.StripFilter {items} bind:value={activeId} label="Tutorial wählen" />
		{#key active.id}
			<TutorialView tutorial={active} />
		{/key}
	</div>
</AreaShell>

<style>
	.explain {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-m);
	}
</style>
