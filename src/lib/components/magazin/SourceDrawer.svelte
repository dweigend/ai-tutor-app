<script lang="ts">
	import { tick } from 'svelte';
	import { Fold } from '$lib/modules';
	import { pad2, type SourceEntry } from './article';

	interface Props {
		entries: readonly SourceEntry[];
		/** Prefix of the entry ids, so a `[01]` in the text can reach its line. */
		id: string;
	}

	let { entries, id }: Props = $props();

	let open = $state(false);

	/** Opens the drawer and puts the focus on entry `n` (a `[01]` in the text calls this). */
	export async function reveal(n: number): Promise<void> {
		open = true;
		await tick();
		const row = document.getElementById(`${id}-${pad2(n)}`);
		const link = row?.querySelector('a') ?? row;
		link?.focus({ preventScroll: true });
		link?.scrollIntoView({ block: 'center' });
	}
</script>

<!--
	SourceDrawer recipe on the P8 Fold (konzept Z3): `QUELLEN [05] +`, closed by default and found
	by the browser's search (hiddenUntilFound). Open: a compact Mono list with a hanging index,
	`[01] Autor Jahr · Titel ↗`. An extraction gap of the Hermes evidence is marked, not hidden.
-->
<div class="article-sources">
	<Fold.Root label="Quellen" count={entries.length} triggerLabel="Quellen öffnen" bind:open>
		<ol class="fold-sources">
			{#each entries as entry (entry.source.sourceId)}
				<li tabindex="-1" class="fold-source" id="{id}-{pad2(entry.n)}">
					<span class="fold-source-index" aria-hidden="true">[{pad2(entry.n)}]</span>
					<span>
						{#if entry.source.href}<a
								class="fold-source-link"
								href={entry.source.href}
								target="_blank"
								rel="noopener noreferrer"
							>
								{entry.source.label}<span class="fold-source-sign" aria-hidden="true"> ↗</span><span
									class="visually-hidden"
								>
									(extern)
								</span>
							</a>{:else}{entry.source.label}{/if}
						{#if entry.gap}<span class="source-gap">· Beleg unvollständig</span>{/if}
					</span>
				</li>
			{/each}
		</ol>
	</Fold.Root>
</div>

<style>
	/* --step-7 of air above, hairlines above and below the row (konzept Z3). */
	.article-sources {
		margin-block-start: var(--step-7);
		border-block: var(--hairline-width) solid var(--hairline);
	}

	/* The column already keeps the gutter; the row and the list start on it. */
	.article-sources :global(.fold-trigger) {
		padding-inline: 0;
	}

	.article-sources :global(.fold-content) {
		padding-block-end: var(--step-3);
	}

	.source-gap {
		font-family: var(--font-mono);
		font-size: var(--type-label);
	}
</style>
