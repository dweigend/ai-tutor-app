<script lang="ts">
	let { deviates, text }: { deviates: boolean; text: string } = $props();
</script>

<p class="lab-finding" data-deviates={deviates || undefined} aria-live="polite">
	{deviates ? '■ weicht ab' : text}
</p>

<style>
	.lab-finding {
		min-block-size: calc(var(--type-label) * var(--line-body));
		margin: 0;
		padding-inline-start: var(--step-2);
		border-inline-start: var(--edge-width) solid transparent;
		font-family: var(--font-mono);
		font-size: var(--type-label);
		line-height: var(--line-body);
	}
	.lab-finding[data-deviates] {
		border-inline-start-color: var(--palette-signal-crimson);
	}
</style>
