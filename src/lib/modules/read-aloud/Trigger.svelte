<script lang="ts">
	import Icon from '../core/Icon.svelte';
	import { getReadAloudContext, getScopeContext } from './context.js';
	import { triggerView } from './controller.js';

	interface Props {
		/** Accessible name; stays the same in both states, aria-pressed tells which one. */
		label?: string;
	}

	let { label = 'Vorlesen' }: Props = $props();

	const readAloud = getReadAloudContext();
	const scope = getScopeContext();
	const scopeId = scope?.id ?? null;

	// No voice or nothing to read: no button at all (DESIGN.md §7, "Was nicht geht, steht nicht da").
	let view = $derived(triggerView(readAloud?.state, scopeId));
</script>

<!-- Two states only: speaker at rest, pause while speaking. -->
{#if view}
	<button
		type="button"
		class="m-icon-button"
		aria-label={label}
		aria-pressed={view.pressed}
		title={view.pressed ? 'Pause' : label}
		onclick={() => readAloud?.controller.toggle(scopeId)}
	>
		<Icon name={view.pressed ? 'pause' : 'volume'} />
	</button>
{/if}
