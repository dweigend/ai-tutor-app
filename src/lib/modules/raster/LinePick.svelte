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
	LinePick recipe (konzept M9): a code sheet in Mono 400, 13 px (`data-code="small"`, K3) with line
	numbers in the margin. Each line is a full-width strip of at least a half cell (32px, DESIGN.md
	§2.1). Chosen = --mark plus a check in the margin. Long lines wrap with a hanging indent; nothing
	scrolls sideways. Each nesting level is drawn with two spaces.
-->
<ToggleGroup.Root
	type="multiple"
	class="raster line-pick"
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
					class="raster-cell line-pick-line"
					data-code="small"
					data-hit="code-line"
					data-selected={pressed || undefined}
				>
					<span class="line-pick-sign" aria-hidden="true">
						{#if pressed}<Icon name="check" size={20} />{/if}
					</span>
					<span class="line-pick-number" aria-hidden="true">{line.number}</span>
					<code class="line-pick-code" style:--indent="{line.indent}ch">{line.text}</code>
				</button>
			{/snippet}
		</ToggleGroup.Item>
	{/each}
</ToggleGroup.Root>
