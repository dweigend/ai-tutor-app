<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		labId: string;
		title: string;
		/** Controls in the head row, e.g. a mode switch. */
		tools?: Snippet;
		onreset: () => void;
		children: Snippet;
	}

	let { labId, title, tools, onreset, children }: Props = $props();
</script>

<!--
	Shared chrome for the labs: a white well with a hairline frame, a label row and a reset.
	The :global rules style controls the labs share (switch, segmented modes, small buttons).
-->
<section class="lab" aria-labelledby="{labId}-title">
	<header class="lab-head">
		<p id="{labId}-title" class="label">{title}</p>
		{#if tools}{@render tools()}{/if}
	</header>
	{@render children()}
	<footer class="lab-foot">
		<button type="button" class="button button-quiet small" onclick={onreset}>Zurücksetzen</button>
	</footer>
</section>

<style>
	.lab {
		display: grid;
		gap: var(--step-5);
		padding: var(--step-4);
		border: var(--hairline-width) solid var(--hairline);
		background: var(--palette-white);
	}

	.lab-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--step-3);
		margin: calc(-1 * var(--step-4)) calc(-1 * var(--step-4)) 0;
		padding: var(--step-2) var(--step-2) var(--step-2) var(--step-4);
		border-block-end: var(--hairline-width) solid var(--hairline);
		background: var(--palette-ink);
		color: var(--palette-white);
	}

	.lab-foot {
		display: flex;
		justify-content: flex-end;
	}

	.lab :global(.small) {
		min-block-size: 2.75rem;
		padding-inline: var(--step-4);
		font-size: var(--type-label);
	}

	/* Segmented mode switch on the ink head: white text on ink, ink text on white when pressed. */
	.lab :global(.modes) {
		display: flex;
		border: var(--hairline-width) solid var(--palette-white);
	}

	.lab :global(.modes button) {
		min-block-size: 2.75rem;
		padding: 0 var(--step-3);
		border: 0;
		background: transparent;
		color: var(--palette-white);
		font-size: var(--type-label);
		font-stretch: 112%;
		font-weight: 600;
		letter-spacing: var(--letter-label);
		text-transform: uppercase;
		cursor: pointer;
	}

	.lab :global(.modes button + button) {
		border-inline-start: var(--hairline-width) solid var(--palette-white);
	}

	.lab :global(.modes button:hover) {
		text-decoration: underline;
		text-underline-offset: 0.3em;
	}

	.lab :global(.modes button[aria-pressed='true']) {
		background: var(--palette-white);
		color: var(--palette-ink);
	}

	.lab :global(.modes button:focus-visible) {
		outline: 2px solid var(--palette-signal-yellow);
		outline-offset: -4px;
	}

	/* Yellow on the white active button is too faint; ink keeps the ring visible there. */
	.lab :global(.modes button[aria-pressed='true']:focus-visible) {
		outline-color: var(--palette-ink);
	}

	.lab :global(.controls) {
		display: grid;
		gap: var(--step-4);
	}

	/* A native checkbox drawn as a square switch; the input keeps its role and keyboard use. */
	.lab :global(.switch) {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: var(--step-3);
		min-block-size: 2.75rem;
		cursor: pointer;
	}

	.lab :global(.switch input) {
		position: absolute;
		opacity: 0;
		inline-size: 1px;
		block-size: 1px;
	}

	.lab :global(.switch-track) {
		position: relative;
		flex: none;
		inline-size: 2.5rem;
		block-size: 1.25rem;
		border: var(--hairline-width) solid var(--hairline);
		background: var(--palette-white);
	}

	.lab :global(.switch-track::after) {
		position: absolute;
		inset: 2px auto 2px 2px;
		inline-size: calc(50% - 2px);
		background: var(--text-muted);
		content: '';
	}

	.lab :global(.switch input:checked + .switch-track) {
		background: var(--palette-signal-yellow);
	}

	.lab :global(.switch input:checked + .switch-track::after) {
		inset-inline-start: calc(50%);
		background: var(--palette-ink);
	}

	.lab :global(.switch input:focus-visible + .switch-track) {
		outline: 2px solid var(--focus);
		outline-offset: 3px;
	}

	.lab :global(.switch input:disabled + .switch-track) {
		opacity: 0.4;
	}

	.lab :global(.switch:has(input:disabled)) {
		cursor: not-allowed;
	}
</style>
