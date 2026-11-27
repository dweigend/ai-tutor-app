<script lang="ts">
	import { onMount } from 'svelte';
	import { IconButton } from '$lib/modules';
	interface Recognition {
		lang: string;
		start(): void;
		abort(): void;
		onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
		onend: (() => void) | null;
		onerror: (() => void) | null;
	}
	let { ontext }: { ontext: (value: string) => void } = $props();
	let recognition = $state.raw<Recognition>(),
		recording = $state(false),
		error = $state('');
	onMount(() => {
		const browser = window as Window & {
			SpeechRecognition?: new () => Recognition;
			webkitSpeechRecognition?: new () => Recognition;
		};
		const Constructor = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
		if (!Constructor) return;
		const r = new Constructor();
		recognition = r;
		r.lang = 'de-DE';
		r.onresult = (e) => {
			const text = e.results[0]?.[0]?.transcript;
			if (text) ontext(text);
		};
		r.onend = () => (recording = false);
		r.onerror = () => {
			recording = false;
			error = 'Spracheingabe nicht verfügbar.';
		};
		return () => {
			r.onresult = r.onend = r.onerror = null;
			r.abort();
		};
	});
	function toggle() {
		if (recording) {
			recognition?.abort();
			return;
		}
		try {
			error = '';
			recognition?.start();
			recording = true;
		} catch {
			error = 'Spracheingabe nicht verfügbar.';
		}
	}
</script>

{#if recognition}<IconButton
		icon="mic"
		label="Spracheingabe"
		active={recording}
		class="dictation"
		onclick={toggle}
	/>{/if}
{#if error}<span class="error" role="status">{error}</span>{/if}

<style>
	:global(.dictation[aria-pressed='true']) {
		background: var(--mark);
		color: var(--mark-text);
	}
	.error {
		position: absolute;
		bottom: 100%;
		background: var(--card);
		padding: 0.5rem;
		border-radius: var(--radius-option);
	}
</style>
