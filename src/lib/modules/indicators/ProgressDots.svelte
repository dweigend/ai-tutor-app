<script lang="ts">
	let {
		step,
		total,
		label = 'Fortschritt'
	}: { step: number; total: number; label?: string } = $props();
	let count = $derived(Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0);
	let current = $derived(
		Number.isFinite(step) ? Math.min(count, Math.max(0, Math.floor(step))) : 0
	);
</script>

{#if count}
	<div
		class="dots"
		role="progressbar"
		aria-label={label}
		aria-valuemin={0}
		aria-valuemax={count}
		aria-valuenow={current}
	>
		{#each Array(count) as _, i (i)}<i class:done={i < current}></i>{/each}
	</div>
{/if}

<style>
	.dots {
		display: flex;
		align-items: center;
		gap: var(--dot-gap);
	}
	i {
		width: var(--step-dot-size);
		height: var(--step-dot-size);
		border: 1px solid currentColor;
		border-radius: 50%;
	}
	.done {
		background: currentColor;
	}
</style>
