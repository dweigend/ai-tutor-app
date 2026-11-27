<script lang="ts">
	interface Props {
		sources: readonly { label: string; href?: string }[];
	}

	let { sources }: Props = $props();

	const pad = (value: number) => String(value).padStart(2, '0');
</script>

<!-- Compact Mono list with a hanging index; ↗ marks a link that leaves the app (DESIGN.md §7). -->
<ol class="fold-sources">
	{#each sources as source, index (source)}
		<li class="fold-source">
			<span class="fold-source-index" aria-hidden="true">[{pad(index + 1)}]</span>
			{#if source.href}<a
					class="fold-source-link"
					href={source.href}
					target="_blank"
					rel="noopener noreferrer"
				>
					{source.label}<span class="fold-source-sign" aria-hidden="true"> ↗</span><span
						class="visually-hidden"
					>
						(extern)
					</span>
				</a>{:else}<span>{source.label}</span>{/if}
		</li>
	{/each}
</ol>
