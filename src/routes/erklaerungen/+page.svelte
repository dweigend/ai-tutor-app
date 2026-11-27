<script lang="ts">
	import ExplainDeck from '$lib/components/tutorials/ExplainDeck.svelte';
	import { areaFor } from '$lib/navigation';
</script>

<svelte:head>
	<title>{areaFor('/erklaerungen').label} | Tutor</title>
</svelte:head>

<ExplainDeck />
