<script lang="ts">
	import { onMount, type Snippet } from 'svelte';

	let {
		context,
		figure,
		children,
		onnext,
		covered = $bindable(false)
	}: {
		context: string;
		figure: Snippet;
		children: Snippet;
		onnext: () => void;
		covered?: boolean;
	} = $props();

	// A native modal makes the background inert, including the lab's canvas.
	onMount(() => {
		function checkCoverage() {
			covered = document.querySelector('dialog:modal') !== null;
		}
		const observer = new MutationObserver(checkCoverage);
		observer.observe(document.body, {
			subtree: true,
			childList: true,
			attributes: true,
			attributeFilter: ['open']
		});
		checkCoverage();
		return () => observer.disconnect();
	});
</script>

<section class="lab-stage" data-surface="paper" aria-label={context}>
	{@render figure()}
	<div class="lab-controls">{@render children()}</div>
	<button type="button" class="m-key lab-action" data-primary-action onclick={onnext}>
		Weiter
	</button>
</section>

<style>
	.lab-stage {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-m);
	}
	.lab-stage > :global(.figure-plate) {
		grid-template-rows: clamp(14rem, 42dvh, 28rem) auto;
	}
	.lab-controls {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-s);
	}
	.lab-action {
		inline-size: 100%;
		min-block-size: var(--control);
		border-radius: var(--radius-pill);
	}
</style>
