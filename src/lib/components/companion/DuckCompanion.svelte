<script lang="ts">
	import { page } from '$app/state';
	import { tick } from 'svelte';
	import { getTutorAppContext } from '$lib/api/context.svelte';
	import type { TutorApiClient } from '$lib/api/types';
	import { findRelevantNotes } from '$lib/memory';
	import { learningMemory, screenContext } from '$lib/memory/runtime.svelte';
	import Duck2D from '../duck/Duck2D.svelte';
	import { sameCompanionContent } from './companion-logic';
	import CompanionSheet from './CompanionSheet.svelte';
	const app = getTutorAppContext();
	let trigger = $state<HTMLButtonElement>();
	let opened = $state.raw<{
		screen: typeof screenContext.current;
		client: TutorApiClient;
	} | null>(null);
	let sameContent = $derived(
		opened &&
			sameCompanionContent(opened.screen, screenContext.current) &&
			opened.client === app.client &&
			opened.screen.route === page.url.pathname
	);
	$effect(() => {
		if (opened && !sameContent) opened = null;
	});
	let hint = $derived(
		!screenContext.current.isIndependentProbe &&
			(!!screenContext.current.termId ||
				findRelevantNotes(screenContext.current, learningMemory.current.savedNotesAndQuestions)
					.length > 0)
	);
	function open() {
		learningMemory.refresh();
		opened = {
			screen: screenContext.current,
			client: app.client
		};
	}
	async function close() {
		opened = null;
		await tick();
		trigger?.focus({ preventScroll: true });
	}
</script>

{#if page.url.pathname.replace(/\/$/, '') !== '/tutor'}
	<button
		bind:this={trigger}
		class="trigger"
		aria-label="Tutor-Ente öffnen"
		aria-haspopup="dialog"
		onclick={open}
	>
		<span aria-hidden="true"><Duck2D pose="wait" /></span>{#if hint}<i aria-hidden="true"></i>{/if}
	</button>
	{#if sameContent}
		<CompanionSheet
			share={app.shareWithApi}
			onshare={(enabled) => (app.shareWithApi = enabled)}
			onclose={close}
		/>
	{/if}
{/if}

<style>
	/* One anchor: the bottom right corner, on every page. */
	.trigger {
		position: fixed;
		z-index: 4;
		right: var(--corner-inset);
		bottom: max(var(--space-m), env(safe-area-inset-bottom));
		width: var(--hit);
		height: var(--hit);
		padding: 0;
		background: var(--mark);
		color: var(--mark-text);
		border: var(--edge-width) solid var(--mark-border);
		border-radius: 50%;
		cursor: pointer;
	}
	.trigger span {
		display: block;
		height: 100%;
		overflow: hidden;
		border-radius: 50%;
	}
	.trigger i {
		position: absolute;
		right: 0;
		top: 0;
		width: var(--tool-dot);
		height: var(--tool-dot);
		background: var(--mark-text);
		border: var(--edge-width) solid var(--card);
		border-radius: 50%;
	}
	/*
	 * Only a real stage moves it: there the lowest 80px belong to the primary action alone
	 * (DESIGN.md §2.6), so the duck stands above that socket. A check inside a reading page is
	 * no such stage, it scrolls with its page.
	 */
	:global(main:has(.stage-action):not(:has(.check-stage))) ~ .trigger {
		bottom: calc(var(--action-zone) + env(safe-area-inset-bottom) + var(--space-s));
	}
</style>
