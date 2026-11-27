<script lang="ts">
	import { loadTrustedImage } from '$lib/api/media';

	interface Props {
		/** Already checked by `trustedMediaUrl`: the app or the configured tutor origin. */
		url: string;
		alt: string;
	}

	let { url, alt }: Props = $props();

	let source = $state<string | null>(null);
	let failed = $state(false);

	// fetch with redirect: 'error' into a Blob URL; the URL is revoked on change and unmount.
	$effect(() => {
		const controller = new AbortController();
		let objectUrl: string | null = null;
		source = null;
		failed = false;
		void loadTrustedImage(url, controller.signal).then((blob) => {
			if (controller.signal.aborted) return;
			if (!blob) {
				failed = true;
				return;
			}
			objectUrl = URL.createObjectURL(blob);
			source = objectUrl;
		});
		return () => {
			controller.abort();
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		};
	});
</script>

{#if source}
	<img class="media" src={source} {alt} />
{:else if failed}
	<p class="media-missing">Bild nicht geladen{alt ? `: ${alt}` : ''}</p>
{/if}

<style>
	.media {
		max-inline-size: min(100%, 24rem);
		border: var(--hairline-width) solid var(--hairline);
	}

	.media-missing {
		color: var(--text-muted);
		font-family: var(--font-mono);
		font-size: var(--type-label);
		overflow-wrap: anywhere;
	}
</style>
