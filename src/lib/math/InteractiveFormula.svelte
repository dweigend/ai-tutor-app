<script lang="ts">
	import { tick } from 'svelte';
	import Icon from '$lib/modules/core/Icon.svelte';
	import {
		attentionTerms,
		termPills,
		type AttentionTermId,
		type FormulaSelection
	} from './attention-terms.js';
	import type { FormulaNode } from './editorial-formulas.js';
	import Formula from './Formula.svelte';

	let {
		formula,
		ontermchange
	}: {
		formula: FormulaNode;
		ontermchange?: (selection: FormulaSelection | null) => void;
	} = $props();

	const helpId = $props.id();
	let pills = $derived(termPills(formula.interactiveTerms));
	let active = $state<AttentionTermId | null>(null);
	let opener: HTMLButtonElement | null = null;

	function open(termId: AttentionTermId, trigger: HTMLButtonElement) {
		if (active === termId && opener === trigger) {
			void close();
			return;
		}
		active = termId;
		opener = trigger;
		ontermchange?.({
			formulaId: formula.id,
			formulaLatex: formula.latex,
			termId,
			termLabel: attentionTerms[termId].label
		});
	}

	async function close() {
		const trigger = opener;
		opener = null;
		active = null;
		ontermchange?.(null);
		await tick();
		trigger?.focus();
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !active || event.defaultPrevented) return;
		event.preventDefault();
		void close();
	}
</script>

<svelte:window {onkeydown} />

<div class="interactive">
	<Formula {formula} display />
	<div class="terms" role="group" aria-label="Terme der Formel">
		{#each pills as termId (termId)}
			<button
				type="button"
				class="term"
				aria-label={attentionTerms[termId].spoken}
				aria-controls={active === termId ? helpId : undefined}
				aria-expanded={active === termId}
				onclick={(event) => open(termId, event.currentTarget)}
			>
				{attentionTerms[termId].label}
			</button>
		{/each}
	</div>
	<div class="term-help" aria-live="polite">
		{#if active}
			<div class="explanation" id={helpId}>
				<p><strong>{attentionTerms[active].spoken}</strong> {attentionTerms[active].explanation}</p>
				<button type="button" class="close" aria-label="Termerklärung schließen" onclick={close}>
					<Icon name="close" />
				</button>
			</div>
		{/if}
	</div>
</div>

<style>
	.interactive {
		min-inline-size: 0;
	}

	.terms {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-s);
		margin-block-start: var(--space-s);
	}

	button {
		display: inline-grid;
		place-items: center;
		min-inline-size: var(--hit);
		min-block-size: var(--hit);
		border: var(--hairline-width) solid transparent;
		border-radius: var(--radius-pill);
		background: var(--card);
		color: var(--text);
		font: inherit;
		cursor: pointer;
		touch-action: manipulation;
	}

	button:hover {
		border-color: var(--text);
	}

	.term {
		padding-inline: var(--space-s);
	}

	.term[aria-expanded='true'] {
		background: var(--mark);
		color: var(--mark-text);
	}

	.explanation {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: var(--space-s);
		align-items: start;
		padding: var(--space-s);
		margin-block-start: var(--space-s);
		background: var(--well);
	}

	.explanation p {
		margin: 0;
		overflow-wrap: anywhere;
	}

	.close {
		padding: 0;
	}
</style>
