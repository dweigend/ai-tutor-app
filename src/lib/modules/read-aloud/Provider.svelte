<script lang="ts">
	import type { Snippet } from 'svelte';
	import { createReadAloud, type ReadAloudState } from './controller.js';
	import { setReadAloudContext } from './context.js';
	import type { SpeechAdapter } from './speech.js';

	interface Props {
		/** Null on the server and where speech is missing; the trigger then stays disabled. */
		adapter: SpeechAdapter | null | undefined;
		children: Snippet;
	}

	let { adapter, children }: Props = $props();

	const controller = createReadAloud();
	let current = $state<ReadAloudState>(controller.getState());
	setReadAloudContext({
		controller,
		get state() {
			return current;
		}
	});

	$effect(() => controller.subscribe((next) => (current = next)));
	$effect(() => controller.setAdapter(adapter ?? null));
	$effect(() => () => controller.dispose());
</script>

{@render children()}
