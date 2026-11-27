<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { animate, Icon, ReadAloud, type Animation } from '$lib/modules';
	import { getTutorAppContext } from '$lib/api/context.svelte';
	import { learningMemory, screenContext } from '$lib/memory/runtime.svelte';
	import MemoryDrawer from '../companion/MemoryDrawer.svelte';
	import ConnectionDialog from '../tutor/ConnectionDialog.svelte';
	import { topDrawer } from './top-drawer.svelte';
	const app = getTutorAppContext();
	const drawer = topDrawer();
	let panel: HTMLElement;
	let grip: HTMLButtonElement;
	let height = $state(1);
	let fraction = $state(0);
	let near = $state(false);
	let memory = $state(false);
	let drag: { id: number; y: number; start: number } | undefined;
	let moved = false;
	let swipeStart: number | undefined;
	function touchStart(event: TouchEvent) {
		// Leave scrolling a long memory list to the browser.
		const target =
			event.target instanceof Element ? event.target.closest<HTMLElement>('#shell-settings') : null;
		if (!target) {
			swipeStart = undefined;
			return;
		}
		swipeStart =
			target.scrollHeight <= target.clientHeight && event.touches.length === 1
				? event.touches[0].clientY
				: undefined;
	}
	function touchEnd(event: TouchEvent) {
		if (swipeStart !== undefined && event.changedTouches[0].clientY < swipeStart - 32) close(true);
		swipeStart = undefined;
	}
	let animation: Animation | undefined;
	function settle(open: boolean) {
		animation?.stop();
		animation = animate({
			from: fraction,
			to: Number(open),
			restDelta: 0.001,
			preset: 'carry',
			onUpdate: (value) => (fraction = value)
		});
	}
	$effect(() => {
		const open = drawer.open;
		untrack(() => settle(open));
	});
	afterNavigate(() => {
		drawer.close();
		memory = false;
		near = false;
	});
	onDestroy(() => animation?.stop());
	function close(focus = false) {
		drawer.close();
		if (focus) grip.focus();
	}
	function outside(e: PointerEvent) {
		const target = e.target;
		if (
			drawer.open &&
			target instanceof Element &&
			!panel.contains(target) &&
			!target.closest('[data-dialog-content],[data-dialog-overlay]')
		)
			close();
	}
	function start(e: PointerEvent) {
		if (drag || !e.isPrimary || e.button !== 0) return;
		animation?.stop();
		moved = false;
		drag = { id: e.pointerId, y: e.clientY, start: fraction };
		grip.setPointerCapture(e.pointerId);
	}
	function move(e: PointerEvent) {
		near = e.clientY <= 20;
		if (!drag || drag.id !== e.pointerId) return;
		const delta = e.clientY - drag.y;
		moved ||= Math.abs(delta) > 4;
		fraction = Math.min(1, Math.max(0, drag.start + delta / height));
	}
	function release(e: PointerEvent) {
		if (!drag || drag.id !== e.pointerId) return;
		const delta = e.clientY - drag.y;
		drag = undefined;
		if (!moved) return;
		const open = Math.abs(delta) > 24 ? delta > 0 : fraction > 0.5;
		drawer.toggle(open);
		settle(open);
	}
	function cancel(e: PointerEvent) {
		if (drag?.id !== e.pointerId) return;
		drag = undefined;
		moved = true;
		settle(drawer.open);
	}
	function key(e: KeyboardEvent) {
		if (e.key === 'Escape' && drawer.open && !document.querySelector('[data-dialog-content]')) {
			e.preventDefault();
			e.stopImmediatePropagation();
			close(true);
		}
	}
</script>

<svelte:window
	onpointermove={move}
	onpointerdown={outside}
	onkeydowncapture={key}
	ontouchstart={touchStart}
	ontouchend={touchEnd}
/>
<section
	class="edge"
	aria-label="Einstellungen"
	bind:this={panel}
	style:transform={'translateY(' + (fraction - 1) * 100 + '%)'}
>
	<button
		class="grip"
		class:visible={near || drawer.open || fraction > 0}
		bind:this={grip}
		aria-label="Einstellungen"
		aria-expanded={drawer.open}
		aria-controls="shell-settings"
		onpointerdown={start}
		onpointerup={release}
		onpointercancel={cancel}
		onlostpointercapture={cancel}
		onclick={(e) => {
			if (!moved || !e.detail) {
				const open = !drawer.open;
				animation?.stop();
				fraction = Number(open);
				drawer.toggle(open);
			}
			moved = false;
		}}
	>
		<span></span>
	</button>
	<div class="panel" id="shell-settings" inert={!drawer.open} bind:clientHeight={height}>
		<ConnectionDialog
			shareWithApi={app.shareWithApi}
			onconsent={(value) => (app.shareWithApi = value)}
		/>
		<ReadAloud.Trigger />
		{#if !screenContext.current.isIndependentProbe}
			<button
				class="memory-chip"
				aria-label="Notizen & Verlauf"
				title="Notizen & Verlauf"
				aria-expanded={memory}
				onclick={() => {
					learningMemory.refresh();
					memory = !memory;
				}}
			>
				<Icon name="bookmark" />
			</button>
			{#if memory}<MemoryDrawer
					share={app.shareWithApi}
					onshare={(value) => (app.shareWithApi = value)}
					onclear={() => {
						learningMemory.clearAll();
						app.shareWithApi = false;
					}}
				/>{/if}
		{/if}
		{#each drawer.sections as section (section)}{@render section()}{/each}
	</div>
</section>

<style>
	.edge {
		position: fixed;
		top: 0;
		left: 50%;
		translate: -50% 0;
		z-index: calc(var(--z-popup) - 2);
		width: min(30rem, calc(100% - 2 * (var(--shell-edge) + var(--hit))));
	}
	.panel {
		background: var(--palette-paper);
		border-bottom: var(--hairline-width) solid var(--hairline);
		color: var(--popup-text);
		backdrop-filter: blur(18px) saturate(140%);
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-s);
		padding: var(--space-m);
		padding-top: max(var(--space-m), env(safe-area-inset-top));
		max-height: 75dvh;
		overflow: auto;
		overscroll-behavior: contain;
	}
	.panel :global(.tutor-drawer) {
		flex: 0 0 100%;
		min-inline-size: 0;
	}
	.panel :global(.tutor-drawer .choices) {
		flex-wrap: wrap;
		overflow: visible;
	}
	.panel :global(.drawer-label) {
		display: none;
	}
	.memory-chip {
		display: grid;
		place-items: center;
		width: var(--hit);
		border: 0;
		background: var(--card);
		color: var(--text);
		min-height: var(--hit);
		border-radius: var(--radius-pill);
		cursor: pointer;
	}
	.grip {
		position: absolute;
		top: calc(100% + 2px);
		left: 50%;
		translate: -50% 0;
		width: var(--hit);
		height: var(--hit);
		padding: 0;
		background: transparent;
		border: 0;
		display: grid;
		place-items: center;
		touch-action: none;
		cursor: grab;
	}
	.grip[aria-expanded='true'] {
		z-index: 1;
		top: calc(100% - var(--space-s));
		align-items: start;
	}
	.grip span {
		background: var(--palette-graphite);
		width: 2.5rem;
		height: 4px;
		border-radius: var(--radius-pill);
		opacity: 0;
	}
	.grip.visible span,
	.grip:hover span,
	.grip:focus-visible span {
		opacity: 1;
	}
</style>
