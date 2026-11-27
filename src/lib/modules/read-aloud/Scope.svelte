<script lang="ts">
	import type { Snippet } from 'svelte';
	import { DEFAULT_LANG } from './controller.js';
	import { setScopeContext } from './context.js';

	interface Props {
		/** BCP 47 language of the segments inside. */
		lang?: string;
		children: Snippet;
	}

	let { lang = DEFAULT_LANG, children }: Props = $props();

	const id = $props.id();
	setScopeContext({
		id,
		get lang() {
			return lang;
		}
	});
</script>

{@render children()}
