<script lang="ts">
	let { status, label }: { status: 'good' | 'mid' | 'bad' | 'neutral'; label: string } = $props();
	let level = $derived({ neutral: 0, bad: 1, mid: 2, good: 3 }[status]);
</script>

<span class="signal" role="img" aria-label={label} style:--signal={'var(--status-' + status + ')'}>
	{#each [1, 2, 3] as n (n)}<i class:active={n <= level}></i>{/each}
</span>

<style>
	.signal {
		display: inline-flex;
		gap: var(--dot-gap);
	}
	i {
		display: block;
		width: var(--step-dot-size);
		height: var(--step-dot-size);
		border: 1px solid var(--signal);
	}
	.active {
		background: var(--signal);
	}
</style>
