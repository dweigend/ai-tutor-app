<script lang="ts">
	import { ICONS, type IconName } from './icons.js';

	interface Props {
		name: IconName;
		/** Edge length in CSS px. The stroke keeps its 1.5px at every size. */
		size?: number;
	}

	let { name, size = 24 }: Props = $props();
</script>

<!--
	Decorative by contract (DESIGN.md §7): always aria-hidden, the control carries the name.
	`non-scaling-stroke` holds the line at --icon-stroke when the icon is drawn smaller than 24px.
-->
<svg
	class="m-icon"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	focusable="false"
	data-icon={name}
>
	{#each ICONS[name] as d (d)}
		<path {d} vector-effect="non-scaling-stroke" />
	{/each}
</svg>

<style>
	.m-icon {
		flex: none;
		stroke-width: var(--icon-stroke);
	}
</style>
