<script lang="ts">
	import Icon from '../core/Icon.svelte';

	interface Props {
		/** The start page. It is the one overview of the app, so the sign leads straight there. */
		href: string;
		/** Accessible name of the link. */
		label?: string;
	}

	let { href, label = 'Startseite' }: Props = $props();
</script>

<!-- A link, not a dialog (issue #45): the route change brings the surface wipe (blende.ts). -->
<a class="m-icon-button" {href} aria-label={label}>
	<Icon name="grid" />
</a>
