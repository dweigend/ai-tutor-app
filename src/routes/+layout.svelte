<script lang="ts">
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import DuckCompanion from '$lib/components/companion/DuckCompanion.svelte';
	import { bindVisibility, observeSections, resetRoute } from '$lib/memory/runtime.svelte';
	import { onNavigate } from '$app/navigation';
	import { setTutorAppContext } from '$lib/api/context.svelte';
	import { homeTileRect } from '$lib/components/home/blende-origin';
	import {
		ReadAloud,
		createBrowserSpeechAdapter,
		startSurfaceBlende,
		type SpeechAdapter
	} from '$lib/modules';
	import { syncThemeColor } from '$lib/styles/surface';
	import '$lib/styles/reset.css';
	import '$lib/styles/fonts.css';
	import '$lib/styles/tokens.css';
	import '$lib/styles/base.css';
	import '$lib/modules/modules.css';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
	const tutorApp = setTutorAppContext();
	let main: HTMLElement;
	$effect.pre(() => {
		const url = page.url;
		untrack(() => resetRoute(url));
	});
	$effect(bindVisibility);
	$effect(() => {
		page.url;
		return untrack(() => observeSections(main)).destroy;
	});

	// Speech exists only in the browser; during prerendering the trigger renders disabled.
	let speech = $state<SpeechAdapter | null>(null);
	$effect(() => {
		const adapter = createBrowserSpeechAdapter();
		speech = adapter;
		return () => adapter?.dispose();
	});

	// The browser bar takes the colour of the surface at the top of the screen.
	$effect(() => syncThemeColor(document));

	// Route change: the new surface runs up with a hard edge (DESIGN.md §4.5). Query or hash
	// changes on the same page keep still. A start tile opens its area out of the tile's
	// rectangle, and the way back closes into that tile's place (issue #10).
	onNavigate((navigation) => {
		const from = navigation.from?.url;
		const to = navigation.to?.url;
		if (!from || !to || from.pathname === to.pathname) return;
		return startSurfaceBlende(document, navigation.complete, {
			from: homeTileRect(document, to),
			to: () => homeTileRect(document, from)
		});
	});

	$effect(() => {
		const controller = new AbortController();
		void tutorApp.resolveConfig(controller.signal);
		return () => controller.abort();
	});

	// Keep the "Heute" counter aligned with the local calendar day across midnight or tab switches.
	$effect(() => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		function scheduleMidnight() {
			const now = new Date();
			const nextMidnight = new Date(
				now.getFullYear(),
				now.getMonth(),
				now.getDate() + 1,
				0,
				0,
				0,
				250
			);
			timer = setTimeout(() => {
				tutorApp.syncCalendarDay();
				scheduleMidnight();
			}, nextMidnight.getTime() - now.getTime());
		}
		function onVisibilityChange() {
			clearTimeout(timer);
			if (document.visibilityState === 'visible') {
				tutorApp.syncCalendarDay();
				scheduleMidnight();
			}
		}
		if (!document.hidden) scheduleMidnight();
		document.addEventListener('visibilitychange', onVisibilityChange);
		return () => {
			if (timer !== undefined) clearTimeout(timer);
			document.removeEventListener('visibilitychange', onVisibilityChange);
		};
	});
</script>

<a class="skip-link" href="#main">Zum Inhalt</a>

{#if tutorApp.configError}
	<div class="config-banner" data-surface="crimson" role="alert">
		<p>
			<span class="label">API-Konfiguration</span>
			<span>{tutorApp.configError}</span>
		</p>
		<button type="button" class="config-banner-action" onclick={() => tutorApp.switchMode('mock')}>
			Im Demo-Modus fortfahren
		</button>
	</div>
{/if}

<ReadAloud.Provider adapter={speech}>
	<main
		bind:this={main}
		id="main"
		class:buffered={page.url.pathname === '/' || page.url.pathname === '/erklaerungen'}
		tabindex="-1"
	>
		{@render children()}
	</main>
	<DuckCompanion />
</ReadAloud.Provider>

<style>
	/*
	 * Foot buffer of a scroll page: its last row ends above the duck in the corner. Home and
	 * Erklärungen take it here on paper; the other areas carry the same 96px inside their own
	 * surface, and a stage or the whiteboard fills the viewport and takes none.
	 */
	main.buffered {
		--shell-min-height: calc(100dvh - 96px);
		padding-bottom: 96px;
	}
	main:focus {
		outline: none;
	}

	/* Deviation only: crimson carries white text (6.5:1); the action is the inverted surface. */
	.config-banner {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--step-3);
		padding: var(--step-3) var(--gutter);
	}

	.config-banner p {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--step-2) var(--step-3);
		font-size: var(--type-label);
	}

	.config-banner-action {
		min-block-size: var(--hit);
		padding: 0 var(--step-4);
		border: 0;
		border-radius: var(--radius);
		background: var(--action);
		color: var(--action-text);
		font-weight: 500;
		cursor: pointer;
	}

	.config-banner-action:active {
		background: var(--action-text);
		color: var(--action);
	}
</style>
