<script lang="ts">
	import { onMount } from 'svelte';
	import { Icon } from '$lib/modules';
	let { text, onlevel }: { text: string; onlevel: (level: number) => void } = $props();
	let voice = $state.raw<SpeechSynthesisVoice>(),
		playing = $state(false);
	let utterance: SpeechSynthesisUtterance | null = null,
		timer: ReturnType<typeof setTimeout>;
	function stop() {
		if (utterance) {
			utterance.onboundary = utterance.onstart = utterance.onend = utterance.onerror = null;
			speechSynthesis.cancel();
			utterance = null;
		}
		clearTimeout(timer);
		onlevel(0);
		playing = false;
	}
	onMount(() => {
		if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return;
		const update = () =>
			(voice = speechSynthesis.getVoices().find((v) => v.localService && /^de\b/i.test(v.lang)));
		update();
		speechSynthesis.addEventListener('voiceschanged', update);
		return () => {
			speechSynthesis.removeEventListener('voiceschanged', update);
			stop();
		};
	});
	function toggle() {
		if (playing) {
			stop();
			return;
		}
		if (!voice) return;
		const u = new SpeechSynthesisUtterance(text);
		utterance = u;
		u.lang = 'de-DE';
		u.voice = voice;
		u.onstart = u.onboundary = () => {
			onlevel(0.9);
			clearTimeout(timer);
			timer = setTimeout(() => onlevel(0), 110);
		};
		u.onend = u.onerror = () => {
			utterance = null;
			stop();
		};
		playing = true;
		speechSynthesis.speak(u);
	}
</script>

{#if voice}<button
		type="button"
		aria-label={playing ? 'Vorlesen beenden' : 'Antwort vorlesen'}
		onclick={toggle}
	>
		<Icon name={playing ? 'pause' : 'volume'} />
	</button>{/if}

<style>
	button {
		width: 44px;
		height: 44px;
		background: var(--card);
		color: inherit;
		border: 0;
		border-radius: 50%;
		cursor: pointer;
	}
</style>
