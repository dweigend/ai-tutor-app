<script lang="ts">
	import { untrack } from 'svelte';
	import type { DeckId } from '$lib/content/tutorials';
	import {
		computeAttentionDeckState,
		computeBackpropDeckState,
		drawAttentionDeckFallback,
		drawBackpropDeckFallback,
		fallbackReason,
		loadAttentionDeckScene,
		loadBackpropDeckScene,
		type AttentionDeckParams,
		type BackpropDeckParams,
		type DeckSceneHandle
	} from '$lib/figures';
	import { formatNumber } from './math';
	import { watchReducedMotion } from './reduced-motion';

	/*
	 * The 3D stage of a slide deck. One scene per deck holds the shared WebGL slot; a deck change
	 * disposes it first and starts the next on a fresh canvas. Without WebGL, with reduced motion
	 * or after a lost context the standing 2D sheet takes over (DESIGN.md §9.3f).
	 */
	let {
		deck,
		attention,
		backprop,
		label
	}: {
		deck: DeckId;
		attention: AttentionDeckParams;
		backprop: BackpropDeckParams;
		/** Accessible name of the figure. */
		label: string;
	} = $props();

	type Scene =
		| { deck: 'attention'; handle: DeckSceneHandle<AttentionDeckParams> }
		| { deck: 'backprop'; handle: DeckSceneHandle<BackpropDeckParams> };

	let mode = $state<'pending' | '3d' | '2d'>('pending');
	let reduced = $state(false);
	let canvas = $state<HTMLCanvasElement>();
	let sheet = $state<HTMLCanvasElement>();
	let scene: Scene | null = null;

	/** Green pulse on a term or node of the scene. */
	export function pulseCorrect(target?: string) {
		scene?.handle.pulseCorrect(target);
	}

	/** Crimson shake on a term or node of the scene. */
	export function pulseError(target?: string) {
		scene?.handle.pulseError(target);
	}

	$effect(() =>
		watchReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)'), (next) => {
			reduced = next;
		})
	);

	$effect(() => {
		const target = canvas;
		const which = deck;
		if (reduced || fallbackReason()) {
			mode = '2d';
			return;
		}
		if (!target) return;
		let disposed = false;
		const onlost = () => {
			scene?.handle.dispose();
			scene = null;
			mode = '2d';
		};
		async function start() {
			if (which === 'attention') {
				const module = await loadAttentionDeckScene();
				if (disposed) return;
				const params = untrack(() => attention);
				const handle = module.createAttentionDeckScene({ canvas: target!, params, onlost });
				scene = { deck: which, handle };
			} else {
				const module = await loadBackpropDeckScene();
				if (disposed) return;
				const params = untrack(() => backprop);
				const handle = module.createBackpropDeckScene({ canvas: target!, params, onlost });
				scene = { deck: which, handle };
			}
			mode = '3d';
		}
		// A missing chunk or an occupied WebGL slot ends on the sheet, never on an empty stage.
		start().catch(() => {
			if (!disposed) mode = '2d';
		});
		return () => {
			disposed = true;
			scene?.handle.dispose();
			scene = null;
			mode = 'pending';
		};
	});

	$effect(() => {
		const next = { attention, backprop };
		if (mode !== '3d') return;
		untrack(() => {
			if (scene?.deck === 'attention' && deck === 'attention') scene.handle.update(next.attention);
			else if (scene?.deck === 'backprop' && deck === 'backprop')
				scene.handle.update(next.backprop);
		});
	});

	$effect(() => {
		const target = sheet;
		if (mode !== '2d' || !target) return;
		const draw = () =>
			deck === 'attention'
				? drawAttentionDeckFallback(target, attention)
				: drawBackpropDeckFallback(target, backprop);
		draw();
		const observer = new ResizeObserver(draw);
		observer.observe(target);
		return () => observer.disconnect();
	});

	const n = (value: number, digits = 2) => formatNumber(value, digits);
	const NODE_ROWS = [
		['a', 'a'],
		['b', 'b'],
		['c', 'c'],
		['a · b', 'e'],
		['a · b + c', 'd'],
		['L', 'L']
	] as const;
	let attentionState = $derived(computeAttentionDeckState(attention));
	let backpropState = $derived(computeBackpropDeckState(backprop));
</script>

<div class="deck-stage" data-figure="{deck}-deck" data-mode={mode}>
	<div class="deck-plate" role="img" aria-label={label}>
		{#key deck}
			{#if !reduced}
				<canvas bind:this={canvas} class:pending={mode !== '3d'} aria-hidden="true"></canvas>
			{/if}
		{/key}
		{#if mode === '2d'}
			<canvas bind:this={sheet} aria-hidden="true"></canvas>
		{/if}
	</div>
	<div class="visually-hidden">
		{#if deck === 'attention'}
			<table>
				<caption>
					Attention von Wort {attentionState.focusToken + 1}, Temperatur {n(
						attentionState.temperature,
						1
					)}, Skalierung {attentionState.scaleOn ? 'an' : 'aus'}
				</caption>
				<thead>
					<tr>
						<th scope="col">Wort</th>
						<th scope="col">Punkte</th>
						<th scope="col">Skaliert</th>
						<th scope="col">Gewicht</th>
					</tr>
				</thead>
				<tbody>
					{#each attentionState.weights as weight, index (index)}
						<tr>
							<th scope="row">{index + 1}</th>
							<td>{n(attentionState.rawScores[index])}</td>
							<td>{n(attentionState.logits[index])}</td>
							<td>{n(weight * 100, 1)} %</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{:else}
			<table>
				<caption>Rechengraph mit Lernrate {n(backpropState.lr)}</caption>
				<thead>
					<tr>
						<th scope="col">Knoten</th>
						<th scope="col">Wert</th>
						<th scope="col">Gradient</th>
					</tr>
				</thead>
				<tbody>
					{#each NODE_ROWS as [name, field] (field)}
						<tr>
							<th scope="row">{name}</th>
							<td>{n(backpropState.values[field])}</td>
							<td>{n(backpropState.gradients[field])}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>
</div>

<style>
	.deck-stage,
	.deck-plate {
		position: absolute;
		inset: 0;
	}

	canvas {
		position: absolute;
		inset: 0;
		display: block;
		inline-size: 100%;
		block-size: 100%;
		outline: none;
	}

	.pending {
		visibility: hidden;
	}
</style>
