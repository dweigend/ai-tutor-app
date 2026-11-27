<script lang="ts">
	import Fold from './Fold.svelte';
	import SourceList from './SourceList.svelte';

	interface Props {
		sources: readonly { label: string; href?: string }[];
		open?: boolean;
	}

	let { sources, open = $bindable(false) }: Props = $props();
</script>

<!-- SourceDrawer recipe (konzept Z3): `QUELLEN [05] +`, closed by default. -->
{#if sources.length}
	<Fold label="Quellen" count={sources.length} triggerLabel="Quellen öffnen" bind:open>
		<SourceList {sources} />
	</Fold>
{/if}
