<script lang="ts">
	import Icon from '../core/Icon.svelte';
	const types = {
		exercise: ['sliders', 'Übung'],
		explanation: ['play', 'Erklärung'],
		magazine: ['book', 'Magazin'],
		whiteboard: ['pen', 'Whiteboard'],
		activity: ['flag', 'Aktivität'],
		today: ['star', 'Heute']
	} as const;
	let { type }: { type: keyof typeof types } = $props();
</script>

<span
	role="img"
	aria-label={types[type][1]}
	style:background={'var(--type-' + type + ')'}
	style:color={'var(--type-' + type + '-text)'}
>
	<Icon name={types[type][0]} size={16} />
</span>

<style>
	span {
		display: inline-grid;
		place-items: center;
		width: var(--sign-size);
		height: var(--sign-size);
		border-radius: 50%;
	}
</style>
