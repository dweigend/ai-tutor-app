<script lang="ts">
	import Icon from '../core/Icon.svelte';
	import { ToggleGroup } from 'bits-ui';
	import { drawnIndent } from '../core/code-indent.js';

	interface Props {
		/** Source text; one toggle per line. */
		code: string;
		/** Line ids `z1`, `z2`, … of the chosen lines. */
		value?: string[];
		/** Most lines at once; a further pick drops the oldest one. */
		max?: number;
		label: string;
		disabled?: boolean;
	}

	let { code, value = $bindable([]), max = 1, label, disabled = false }: Props = $props();

	let lines = $derived(
		code.split('\n').map((source, index) => {
			// Two spaces per level on screen (core/code-indent.ts): the nesting stays visible and a
			// line wraps less often on a phone. The text itself keeps every character.
			const { indent, text } = drawnIndent(source);
			return { id: `z${index + 1}`, number: index + 1, indent, text };
		})
	);

	function change(next: string[]) {
		// Keep the newest picks within max: the line tapped last always counts.
		value = next.length > max ? next.slice(next.length - max) : next;
	}
</script>

<!--
	LinePick recipe (konzept M9, V4-5): every code line is its own round, tappable option row, like
	the answer pills of a choice. No grid, no frame, no number column: a quiet line number in the row,
	the code in JetBrains Mono ([data-code]), and a chosen line takes --mark and a check. Long lines
	wrap with a hanging indent; nothing scrolls sideways. The question names the count of lines.
-->
<ToggleGroup.Root
	type="multiple"
	class="line-pick"
	data-layout="lines"
	data-kind="multiple"
	orientation="vertical"
	aria-label={label}
	{value}
	onValueChange={change}
	{disabled}
>
	{#each lines as line (line.id)}
		<ToggleGroup.Item value={line.id} aria-label="Zeile {line.number}: {line.text}">
			{#snippet child({ props, pressed })}
				<button
					{...props}
					class="line-pick-line"
					data-hit="code-line"
					data-selected={pressed || undefined}
				>
					<span class="line-pick-number" aria-hidden="true">{line.number}</span>
					<code class="line-pick-code" data-code="small" style:--indent="{line.indent}ch">
						{line.text}
					</code>
					<span class="line-pick-sign" aria-hidden="true">
						{#if pressed}<span class="m-selection-sign"><Icon name="check" size={16} /></span>{/if}
					</span>
				</button>
			{/snippet}
		</ToggleGroup.Item>
	{/each}
</ToggleGroup.Root>

<style>
	:global(.line-pick[data-layout='lines']) {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--step-1);
	}

	.line-pick-line {
		position: relative;
		display: grid;
		grid-template-columns: 2ch minmax(0, 1fr) var(--sign-size);
		align-items: center;
		gap: var(--space-s);
		inline-size: 100%;
		min-block-size: var(--hit);
		margin: 0;
		padding: var(--step-1) var(--space-s) var(--step-1) var(--space-m);
		border: 0;
		border-radius: var(--radius-option);
		background: var(--card);
		color: var(--text);
		font: inherit;
		text-align: start;
		cursor: pointer;
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
		transition: background-color var(--tap-return) linear;
	}

	.line-pick-number {
		align-self: center;
		margin: 0;
		color: var(--text-muted);
		font-family: var(--font-ui);
		font-size: var(--type-label);
		font-variant-numeric: tabular-nums;
		text-align: end;
	}

	.line-pick-code {
		align-self: center;
		padding-block: var(--step-1);
		padding-inline: calc(var(--indent, 0ch) + 2ch) 0;
		text-indent: -2ch;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.line-pick-sign {
		display: grid;
		place-items: center;
		inline-size: var(--sign-size);
		block-size: var(--sign-size);
	}

	@media (hover: hover) {
		.line-pick-line:hover:not(:disabled):not([data-selected]) {
			background: var(--well);
		}
	}

	/* Chosen: --mark plus a check, as in a choice (DESIGN.md §2.4). */
	.line-pick-line[data-selected] {
		background: var(--mark);
		color: var(--mark-text);
	}

	.line-pick-line[data-selected] .line-pick-number {
		color: inherit;
		font-weight: var(--font-weight-strong);
	}

	/* Pressed: inverted at once, back within --tap-return (DESIGN.md §2.5). */
	.line-pick-line:active:not(:disabled) {
		background: var(--action);
		color: var(--action-text);
		transition: none;
	}

	.line-pick-line:disabled {
		cursor: not-allowed;
	}

	.line-pick-line:focus-visible {
		outline: var(--focus-width) solid var(--focus);
		outline-offset: var(--focus-width);
		z-index: 1;
	}
</style>
