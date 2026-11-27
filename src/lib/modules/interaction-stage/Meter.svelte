<script lang="ts">
	import Icon from '../core/Icon.svelte';
	import { Trigger } from '../read-aloud/index.js';
	import Meter from '../readout/Meter.svelte';
	import { getStageContext } from './context.js';

	interface Props {
		/** Where the back link leads. */
		href: string;
		closeLabel?: string;
	}

	let { href, closeLabel = 'Zurück' }: Props = $props();

	const stage = getStageContext();
	let done = $derived(stage ? stage.step - 1 + (stage.state === 'revealed' ? 1 : 0) : 0);
</script>

<div class="stage-meter" data-row inert={stage?.leaving}>
	<a class="m-icon-button stage-back" {href} aria-label={closeLabel}>
		<Icon name="arrow-left" />
	</a>
	<Meter step={stage?.step ?? 1} steps={stage?.steps ?? 1} {done} label="Schritte" />
	<Trigger />
</div>
