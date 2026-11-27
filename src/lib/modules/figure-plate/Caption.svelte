<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<!-- One Mono caption line over a 1px rule (DESIGN.md §6: Bildzeile, Mono 400, 11px). -->
<!-- svelte-ignore a11y_figcaption_parent (it renders inside FigurePlate.Root's figure) -->
<figcaption class="figure-plate-caption">{@render children()}</figcaption>
