<script lang="ts">
	/**
	 * The duck's speech chip: one short line on duck yellow, a slim pill next to the
	 * duck, never on it (DESIGN.md §15 Nr. 4). The caller places it. With `onopen` the whole chip is the way
	 * into the chat, marked by a small speech-bubble icon instead of a button label. The caller
	 * announces the line in its own live region, so a chip that comes and goes stays audible.
	 */
	let {
		text,
		onopen,
		label = 'Chat öffnen'
	}: { text: string; onopen?: () => void; label?: string } = $props();
</script>

{#if onopen}
	<button
		type="button"
		class="duck-chip"
		aria-haspopup="dialog"
		aria-label={label}
		onclick={onopen}
	>
		<span>{text}</span>
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<path
				d="M4 5h16v11H9l-5 4z"
				fill="none"
				stroke="currentColor"
				stroke-width="1.75"
				stroke-linejoin="round"
			/>
		</svg>
	</button>
{:else}
	<div class="duck-chip"><span>{text}</span></div>
{/if}

<style>
	.duck-chip {
		display: inline-flex;
		align-items: center;
		gap: var(--step-2);
		max-inline-size: min(15rem, calc(100vw - 2 * var(--space-m)));
		padding-block: var(--step-2);
		padding-inline: var(--space-m);
		border: var(--hairline-width) solid var(--palette-ink);
		border-radius: var(--radius-option);
		background: var(--duck-accent);
		color: var(--palette-ink);
		font: inherit;
		font-size: var(--type-meta);
		line-height: 1.3;
		text-align: start;
	}
	/* A slim pill; the touch target still reaches the full hit height around it. */
	button.duck-chip {
		position: relative;
		min-block-size: 2rem;
		padding-block: var(--step-1);
		cursor: pointer;
		touch-action: manipulation;
	}
	button.duck-chip::before {
		content: '';
		position: absolute;
		inset-inline: 0;
		inset-block: min(0px, calc((100% - var(--hit)) / 2));
	}
	button.duck-chip:focus-visible {
		outline: var(--focus-width) solid var(--focus);
		outline-offset: 2px;
	}
	span {
		min-inline-size: 0;
		overflow-wrap: anywhere;
	}
	svg {
		flex: none;
		inline-size: 1rem;
		block-size: 1rem;
		opacity: 0.75;
	}
</style>
