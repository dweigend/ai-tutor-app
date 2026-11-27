<script lang="ts">
	import { resolve } from '$app/paths';
	import { IconButton } from '$lib/modules';
</script>

<IconButton class="global-home" icon="home" href={resolve('/')} label="Startseite" />

<style>
	:global(.global-home) {
		position: fixed;
		pointer-events: auto;
		top: var(--shell-edge);
		right: var(--shell-edge);
		width: 44px;
		height: 44px;
		z-index: var(--z-chrome);
	}
</style>
