<script module lang="ts">
	export type ToolAction = 'undo' | 'clear' | 'save' | 'refine' | 'challenge';
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { Icon, motion, type IconName } from '$lib/modules';
	import { dockMotion } from './dock-motion';
	import { INKS, type InkColor } from './strokes';
	import type { BoardTool } from './tool-selection';

	interface Props {
		tool: BoardTool;
		color: InkColor;
		canUndo: boolean;
		hasStrokes: boolean;
		onselectTool: (tool: BoardTool) => void;
		onselectColor: (color: InkColor) => void;
		onaction: (action: ToolAction) => void;
	}

	let { tool, color, canUndo, hasStrokes, onselectTool, onselectColor, onaction }: Props = $props();

	const id = $props.id();
	const horizontal = new MediaQuery('(min-width: 32rem)');
	const springFrameMs = 1000 / 60;
	const spring = motion.springSamples('carry', springFrameMs);
	let open = $state(false);
	let closing = $state(false);
	let trigger: HTMLButtonElement;
	let dock = $state<HTMLElement | undefined>(undefined);
	let dockProgress = 0;
	let tabStop = $state<string>('pen');
	let marker = $state(0);
	let toolName = $derived(
		tool === 'eraser' ? 'Radierer' : INKS.find((ink) => ink.color === color)?.name
	);
	const actions = $derived<{ id: ToolAction; label: string; icon: IconName; enabled: boolean }[]>([
		{ id: 'undo', label: 'Zurück', icon: 'undo', enabled: canUndo },
		{ id: 'clear', label: 'Leeren', icon: 'trash', enabled: hasStrokes },
		{ id: 'save', label: 'Speichern', icon: 'save', enabled: hasStrokes },
		{ id: 'refine', label: 'Aufbereiten', icon: 'wand', enabled: hasStrokes },
		{ id: 'challenge', label: 'Challenge', icon: 'flag', enabled: true }
	]);

	$effect(() => {
		const target = tool === 'pen' ? 0 : 1 + INKS.length;
		const from = untrack(() => marker);
		if (from === target) return;
		const animation = motion.animate({
			from,
			to: target,
			preset: 'carry',
			restDelta: 0.01,
			onUpdate: (position) => (marker = position)
		});
		return () => animation.stop();
	});

	$effect(() => {
		const node = dock;
		const expanded = open;
		if (!node) return;

		const target = expanded ? 1 : 0;
		const { keyframes, duration } = dockMotion(dockProgress, target, spring, springFrameMs);
		node.style.opacity = String(target);
		node.style.scale = expanded ? '1' : '0.8';
		dockProgress = target;
		if (!duration || motion.prefersReducedMotion()) {
			if (!expanded) closing = false;
			return;
		}

		const animation = node.animate(keyframes, { duration, fill: 'both' });
		animation.onfinish = () => {
			animation.cancel();
			if (!expanded) closing = false;
		};
		return () => {
			if (animation.playState === 'idle') return;
			// Scale preserves the spring's overshoot, which opacity clamps at 1.
			const scale = parseFloat(getComputedStyle(node).scale);
			dockProgress = Number.isFinite(scale) ? (scale - 0.8) / 0.2 : target;
			animation.onfinish = null;
			animation.cancel();
		};
	});

	function close() {
		closing = true;
		open = false;
	}

	function toggle() {
		if (open) {
			close();
			return;
		}
		tabStop = tool;
		open = true;
	}

	function escape(event: KeyboardEvent) {
		if (!open || event.key !== 'Escape') return;
		if (dock?.contains(document.activeElement)) trigger.focus();
		close();
	}

	function navigate(event: KeyboardEvent) {
		const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
		const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
		if (!dock || (!forward && !backward)) return;
		event.preventDefault();
		const buttons = [
			...dock.querySelectorAll<HTMLButtonElement>('button:not([aria-disabled="true"])')
		];
		const index = buttons.findIndex((button) => button === document.activeElement);
		const next = index < 0 ? (forward ? 0 : buttons.length - 1) : index + (forward ? 1 : -1);
		buttons[(next + buttons.length) % buttons.length]?.focus();
	}

	function run(action: ToolAction) {
		trigger.focus();
		close();
		onaction(action);
	}
</script>

<svelte:window onkeydown={escape} />

<div class="tool-control">
	<button
		bind:this={trigger}
		type="button"
		class="m-hit tool-trigger"
		aria-label="Werkzeuge, jetzt {toolName}"
		aria-expanded={open}
		aria-controls={open ? id : undefined}
		onclick={toggle}
	>
		<Icon name={tool} />
		<span
			class="tool-dot"
			class:eraser={tool === 'eraser'}
			style:--dot-color={color}
			aria-hidden="true"
		></span>
		<Icon name={open ? 'minus' : 'plus'} size={20} />
	</button>

	{#if open || closing}
		<div
			bind:this={dock}
			{id}
			class="tool-dock"
			role="toolbar"
			tabindex="-1"
			aria-label="Werkzeuge"
			aria-orientation={horizontal.current ? 'horizontal' : 'vertical'}
			inert={!open}
			onkeydown={navigate}
		>
			<span class="active-marker" style:--position={marker} aria-hidden="true"></span>
			<button
				type="button"
				class="m-hit"
				aria-label="Stift"
				aria-pressed={tool === 'pen'}
				tabindex={tabStop === 'pen' ? 0 : -1}
				onfocus={() => (tabStop = 'pen')}
				onclick={() => onselectTool('pen')}
			>
				<Icon name="pen" />
				<span class="tool-label" aria-hidden="true">Stift</span>
			</button>
			{#each INKS as ink (ink.color)}
				<button
					type="button"
					class="m-hit color-button"
					aria-label={ink.name}
					aria-pressed={tool === 'pen' && color === ink.color}
					tabindex={tabStop === ink.color ? 0 : -1}
					onfocus={() => (tabStop = ink.color)}
					onclick={() => onselectColor(ink.color)}
				>
					<span class="tool-dot" style:--dot-color={ink.color} aria-hidden="true"></span>
					<span class="tool-label" aria-hidden="true">{ink.name}</span>
				</button>
			{/each}
			<button
				type="button"
				class="m-hit"
				aria-label="Radierer"
				aria-pressed={tool === 'eraser'}
				tabindex={tabStop === 'eraser' ? 0 : -1}
				onfocus={() => (tabStop = 'eraser')}
				onclick={() => onselectTool('eraser')}
			>
				<Icon name="eraser" />
				<span class="tool-label" aria-hidden="true">Radierer</span>
			</button>
			<span class="dock-divider" aria-hidden="true"></span>
			{#each actions as action (action.id)}
				<button
					type="button"
					class="m-hit"
					aria-label={action.label}
					aria-pressed={false}
					aria-disabled={!action.enabled}
					tabindex={tabStop === action.id ? 0 : -1}
					onfocus={() => (tabStop = action.id)}
					onclick={() => action.enabled && run(action.id)}
				>
					<Icon name={action.icon} />
					<span class="tool-label" aria-hidden="true">{action.label}</span>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.tool-control {
		position: relative;
		display: flex;
		flex: none;
		pointer-events: none;
	}

	.m-hit {
		border-radius: 50%;
		-webkit-tap-highlight-color: transparent;
	}

	.tool-trigger,
	.tool-dock {
		pointer-events: auto;
	}

	/*
	 * At rest the menu is one raised pill on the gutter: the tool in hand, its ink and the sign
	 * that it opens. Same skin as the dock above it.
	 */
	.tool-trigger {
		display: inline-flex;
		align-items: center;
		gap: var(--space-s);
		block-size: var(--hit);
		padding-inline: var(--space-m);
		border: var(--hairline-width) solid color-mix(in srgb, var(--hairline) 45%, transparent);
		border-radius: var(--radius-pill);
		background: var(--card);
		color: var(--text);
		transition:
			background-color var(--tap-return) linear,
			color var(--tap-return) linear;
	}

	.tool-trigger:active {
		background: var(--text);
		color: var(--surface);
		transition: none;
	}

	/* An ink dot in the text colour stays readable on the inverted pill. */
	.tool-trigger:active .tool-dot {
		outline: var(--hairline-width) solid currentColor;
		outline-offset: var(--hairline-width);
	}

	.tool-trigger:active .tool-dot.eraser {
		border-color: currentColor;
		outline: 0;
	}

	.tool-dot {
		inline-size: var(--tool-dot);
		block-size: var(--tool-dot);
		border-radius: 50%;
		background: var(--dot-color);
	}

	.tool-dot.eraser {
		border: var(--hairline-width) solid var(--text);
		background: transparent;
	}

	.tool-dock {
		--dock-padding: 4px;
		--marker-inset: 3px;
		position: absolute;
		inset-block-end: calc(100% + var(--space-s));
		inset-inline-start: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: var(--dock-padding);
		border: var(--hairline-width) solid color-mix(in srgb, var(--hairline) 45%, transparent);
		border-radius: var(--radius-pill);
		background: var(--card);
		transform-origin: calc(var(--icon-button-size) / 2) bottom;
	}

	.tool-dock .m-hit {
		flex: none;
	}

	.active-marker {
		position: absolute;
		inset: calc(var(--dock-padding) + var(--marker-inset)) auto auto
			calc(var(--dock-padding) + var(--marker-inset));
		inline-size: calc(var(--hit) - 2 * var(--marker-inset));
		aspect-ratio: 1;
		border-radius: 50%;
		background: var(--mark);
		pointer-events: none;
		transform: translateY(calc(var(--position) * var(--hit)));
	}

	.color-button[aria-pressed='true'] .tool-dot {
		outline: var(--hairline-width) solid var(--text);
		outline-offset: 3px;
	}

	.dock-divider {
		inline-size: var(--tool-dot);
		block-size: var(--hairline-width);
		margin-block: var(--dock-padding);
		background: color-mix(in srgb, var(--hairline) 30%, transparent);
	}

	.tool-label {
		position: absolute;
		inset-inline-start: calc(100% + var(--space-s));
		z-index: 1;
		padding: var(--dock-padding) var(--space-s);
		border-radius: var(--radius-pill);
		background: var(--text);
		color: var(--surface);
		font: 500 var(--type-label) / 1.25 var(--font-ui);
		white-space: nowrap;
		visibility: hidden;
		pointer-events: none;
	}

	@media (hover: hover) {
		.m-hit:not([aria-pressed='true'], [aria-disabled='true'], :active):hover {
			background: var(--well);
		}

		.m-hit:hover .tool-label {
			visibility: visible;
		}
	}

	.m-hit:focus-visible .tool-label {
		visibility: visible;
	}

	@media (min-width: 32rem) {
		.tool-dock {
			flex-direction: row;
		}

		.active-marker {
			transform: translateX(calc(var(--position) * var(--hit)));
		}

		.dock-divider {
			inline-size: var(--hairline-width);
			block-size: var(--tool-dot);
			margin: 0 var(--dock-padding);
		}

		.tool-label {
			inset-block-end: calc(100% + var(--space-s));
			inset-inline-start: 50%;
			transform: translateX(-50%);
		}
	}

	@media (max-width: 31.999rem) and (max-height: 32rem) {
		.tool-dock {
			max-block-size: calc(100dvh - var(--bar) - var(--row) - env(safe-area-inset-bottom));
			overflow-y: auto;
			border-radius: var(--radius-option);
		}

		.dock-divider {
			flex: none;
		}

		.tool-label {
			display: none;
		}
	}
</style>
