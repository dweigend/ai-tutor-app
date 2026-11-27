<script lang="ts">
	import { resolve } from '$app/paths';
	import ArticleView from '$lib/components/magazin/ArticleView.svelte';
	import AudioStage from '$lib/components/magazin/AudioStage.svelte';
	import MagazinShell from '$lib/components/magazin/MagazinShell.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let entry = $derived(data.entry);
</script>

<svelte:head>
	{#if entry.kind === 'episode'}<title>{entry.item.title} | Podcast | Tutor</title>{/if}
</svelte:head>

<!--
	Exactly one article or one episode per page (konzept §4.4). An article reads on paper below its
	opener; an episode opens the dot-matrix player on ink. Keyed by slug, so moving to the next
	entry starts fresh and the old player's clock is gone.
-->
{#key entry.item.id}
	{#if entry.kind === 'article'}
		<MagazinShell
			tone={entry.item.tone}
			markHeading={false}
			title="{entry.item.title} | Magazin | Tutor"
		>
			<ArticleView article={entry.item} />
		</MagazinShell>
	{:else}
		<AudioStage episode={entry.item} closeHref="{resolve('/magazin')}#podcast" />
	{/if}
{/key}
