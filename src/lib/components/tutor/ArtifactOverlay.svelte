<script lang="ts">
	import { Formula } from '$lib/math';
	import type { TutorArtifact } from '$lib/api/types';
	import { Icon } from '$lib/modules';
	import { onMount } from 'svelte';
	let {
		artifact,
		onclose,
		onanswer
	}: { artifact: TutorArtifact; onclose: () => void; onanswer: (answer: string) => void } =
		$props();
	let close: HTMLButtonElement;
	onMount(() => close.focus());
	let strokes = $derived(
		artifact.kind === 'sketch'
			? artifact.points.filter(
					(stroke) =>
						Array.isArray(stroke) &&
						stroke.length > 0 &&
						stroke.every(
							(p) =>
								p &&
								Number.isFinite(p.x) &&
								Number.isFinite(p.y) &&
								p.x >= 0 &&
								p.x <= 1 &&
								p.y >= 0 &&
								p.y <= 1
						)
				)
			: []
	);
</script>

<section class="artifact" data-artifact={artifact.kind} aria-labelledby="artifact-title">
	<header>
		<h2 id="artifact-title">{artifact.title}</h2>
		<button bind:this={close} aria-label="Karte schließen" onclick={onclose}>
			<Icon name="close" />
		</button>
	</header>
	{#if artifact.kind === 'formula'}
		<Formula formula={artifact} display />
	{:else if artifact.kind === 'code'}<pre data-code><code>{artifact.code}</code></pre>
	{:else if artifact.kind === 'sketch'}<svg
			viewBox="0 0 100 100"
			role="img"
			aria-label={artifact.title}
		>
			{#each strokes as stroke, i (i)}<polyline
					points={stroke.map((p) => `${100 * p.x},${100 * p.y}`).join(' ')}
					fill="none"
					stroke="currentColor"
					stroke-width="1.25"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>{/each}
		</svg>
	{:else}<p>{artifact.prompt}</p>
		<div class="choices">
			{#each artifact.choices ?? [] as choice, i (i)}<button onclick={() => onanswer(choice)}>
					{choice}
				</button>{/each}
		</div>{/if}
	{#if 'caption' in artifact && artifact.caption}<p>{artifact.caption}</p>{/if}
</section>

<style>
	.artifact {
		background: var(--card);
		border-radius: var(--radius-option);
		padding: 1rem;
		overflow: auto;
		overflow-wrap: anywhere;
	}
	header,
	.choices {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	header {
		justify-content: space-between;
	}
	.choices {
		flex-wrap: wrap;
	}
	h2 {
		font-size: 1.2rem;
	}
	button {
		border: 0;
		background: var(--well);
		color: inherit;
		border-radius: var(--radius-pill);
		min-height: 44px;
		padding-inline: 1rem;
		cursor: pointer;
	}
	header button {
		padding: 0;
		width: 44px;
		flex: none;
		display: grid;
		place-items: center;
	}
	pre {
		overflow: auto;
		padding: 0.75rem;
		background: var(--well);
	}
	svg {
		display: block;
		max-height: 22dvh;
		margin: auto;
	}
	p {
		margin-block: 0.6rem;
	}
</style>
