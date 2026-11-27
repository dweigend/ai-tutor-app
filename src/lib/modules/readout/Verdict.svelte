<script lang="ts">
	import Icon from '../core/Icon.svelte';
	import type { Snippet } from 'svelte';
	import RichText from '../core/RichText.svelte';
	import { FINDING_WORDS, isDeviation } from './finding.js';
	import type { Finding } from './types.js';

	interface Props {
		/** My answer as shown text (rich notation allowed). */
		yours: string;
		/**
		 * value: a short reading such as `1 · 5 · 1` in Mono 500; sentence: a chosen sentence
		 * option in Archivo 400 (correction K6, DESIGN.md §6).
		 */
		voice?: 'value' | 'sentence';
		/** My confidence as a short reading, e.g. `75 %` or `ohne Angabe`. */
		confidence?: string;
		/** What the check says; null shows no finding row (a pure self-assessment). */
		finding: Finding | null;
		/** The finding's own value when the check knows it, e.g. the lines it expects. */
		expected?: string;
		/** One or two sentences of reasoning under the block. */
		children?: Snippet;
		id?: string;
	}

	let { yours, voice = 'value', confidence, finding, expected, children, id }: Props = $props();

	let deviates = $derived(finding !== null && isDeviation(finding));
</script>

<!--
	DU / BEFUND (konzept Z1): a margin-column block. DU is mine (--mark plus a check), BEFUND is ink.
	A deviation adds a crimson bar with the words "weicht ab" (DESIGN.md §5.4).
-->
<div class="readout-verdict" {id} tabindex="-1">
	<dl class="readout-verdict-rows">
		<div class="readout-verdict-row" data-row data-selected>
			<dt class="m-label">Du</dt>
			<dd class="readout-verdict-value">
				<span class="readout-verdict-answer" data-voice={voice}><RichText text={yours} /></span>
				{#if confidence}<span class="readout-verdict-confidence">{confidence}</span>{/if}
				<span class="readout-verdict-sign m-selection-sign" aria-hidden="true">
					<Icon name="check" size={20} />
				</span>
			</dd>
		</div>
		{#if finding}
			<div class="readout-verdict-row" data-row data-finding={finding}>
				<dt class="m-label">Befund</dt>
				<dd class="readout-verdict-value">
					{#if expected}<span class="readout-verdict-answer">
							<RichText text={expected} />
						</span>{/if}
					{#if deviates}
						<span class="readout-verdict-deviation" data-surface="crimson">
							{FINDING_WORDS[finding]}
						</span>
					{:else}
						<span class="readout-verdict-word">{FINDING_WORDS[finding]}</span>
					{/if}
				</dd>
			</div>
		{/if}
	</dl>
	{#if children}
		<div class="readout-verdict-because">{@render children()}</div>
	{/if}
</div>
