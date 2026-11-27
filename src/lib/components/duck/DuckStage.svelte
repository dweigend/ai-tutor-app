<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { asset } from '$app/paths';
	import {
		fallbackReason,
		loadDuckScene,
		webglCoordinator,
		IDLE_GAP_MS,
		type DuckPose,
		type DuckWardrobe,
		type FallbackReason,
		accessoriesFor
	} from '$lib/figures';
	import type { DuckScene, DuckFailure, DuckZone } from '$lib/figures/duck-scene';
	import { isOneShot, POSE_FRAMES } from './triggers';
	import Duck2D from './Duck2D.svelte';
	interface Props {
		pose?: DuckPose;
		cue?: number | string;
		level?: number;
		cells?: number;
		variant?: 'stage' | 'tile' | 'fullscreen' | 'companion';
		idle?: boolean;
		cycle?: boolean;
		active?: boolean;
		figure?: string;
		fps?: 12 | 24;
		wardrobe?: Partial<DuckWardrobe>;
		interactive?: boolean;
		ontickle?: (zone: DuckZone) => void;
		speechLevel?: number;
		onposedone?: (pose: DuckPose) => void;
		onerror?: (failure: DuckFailure) => void;
	}
	let {
		pose = 'wait',
		cue,
		variant = 'stage',
		idle = false,
		cycle = false,
		active = true,
		figure = 'duck',
		fps = 12,
		wardrobe = {},
		interactive = true,
		ontickle,
		speechLevel = 0,
		onposedone,
		onerror,
		level = 0,
		cells = 16
	}: Props = $props();
	let air: HTMLDivElement,
		canvas = $state<HTMLCanvasElement>(),
		scene = $state.raw<DuckScene>();
	let shown = $state<DuckPose>('wait'),
		ready = $state(false),
		generation = $state(0),
		visible = $state(false),
		mounted = $state(false);
	let failure = $state<DuckFailure>(),
		policy = $state<FallbackReason | null>(null),
		granted = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;
	function finish(ended: DuckPose) {
		shown = 'wait';
		onposedone?.(ended);
	}
	export function play(value: DuckPose) {
		clearTimeout(timer);
		shown = value;
		if (scene) scene.play(value);
		else if (!document.hidden && isOneShot(value))
			timer = setTimeout(() => finish(value), (POSE_FRAMES[value] * 1000) / 12);
	}
	export function poke() {
		play('giggle');
	}
	export function pulseSyllable() {
		scene?.pulseSyllable();
	}
	export function setSpeechLevel(value: number) {
		scene?.setSpeechLevel(value);
	}
	$effect(() => {
		const value = pose;
		void cue;
		untrack(() => play(value));
	});
	$effect(() => {
		scene?.setWardrobe(wardrobe);
	});
	$effect(() => {
		scene?.setInteractive(interactive);
	});
	$effect(() => {
		scene?.setSpeechLevel(speechLevel);
	});
	$effect(() => {
		if (!(idle || cycle) || !ready || !visible || !active) return;
		const timer = setInterval(() => {
			if (shown === 'wait' || shown === 'idle') play('look_around');
		}, IDLE_GAP_MS);
		return () => clearInterval(timer);
	});
	onMount(() => {
		const media = matchMedia('(prefers-reduced-motion: reduce)');
		const updatePolicy = () => (policy = fallbackReason());
		updatePolicy();
		media.addEventListener('change', updatePolicy);
		let intersecting = false;
		const update = () => {
			visible = intersecting && !document.hidden;
		};
		const observer = new IntersectionObserver((entries) => {
			intersecting = entries[entries.length - 1].isIntersecting;
			update();
		});
		observer.observe(air);
		function visibilityChanged() {
			update();
			if (document.hidden) clearTimeout(timer);
			else if (!scene && isOneShot(shown)) play(shown);
		}
		document.addEventListener('visibilitychange', visibilityChanged);
		mounted = true;
		return () => {
			mounted = false;
			clearTimeout(timer);
			observer.disconnect();
			media.removeEventListener('change', updatePolicy);
			document.removeEventListener('visibilitychange', visibilityChanged);
		};
	});
	$effect(() => {
		if (!mounted || !visible || !active || policy || failure) return;
		const priority = variant === 'fullscreen' ? 'stage' : variant;
		let version = 0;
		return untrack(() =>
			webglCoordinator.request(priority, (allowed) => {
				const id = ++version;
				granted = allowed;
				ready = false;
				const old = scene;
				scene = undefined;
				old?.dispose();
				if (!allowed) {
					if (mounted && old && isOneShot(shown)) play(shown);
					return;
				}
				generation++;
				const stale = () => version !== id;
				function fail(value: DuckFailure) {
					if (!stale()) {
						failure = value;
						ready = false;
						onerror?.(value);
					}
				}
				void tick()
					.then(async () => {
						if (stale() || !canvas) return;
						const module = await loadDuckScene();
						if (stale()) return;
						const created = await module.createDuckScene({
							canvas,
							url: asset('/models/duck_v3.glb'),
							figure,
							fps,
							isCancelled: stale,
							onfirstframe: () => {
								if (!stale()) ready = true;
							},
							onerror: fail,
							ondone: finish,
							ontickle: (zone) => {
								if (zone === 'head') shown = 'nod';
								if (zone === 'belly') shown = 'giggle';
								ontickle?.(zone);
							}
						});
						if (!created) return;
						if (stale()) {
							created.dispose();
							return;
						}
						clearTimeout(timer);
						scene = created;
						scene.play(shown);
					})
					.catch((error) => fail({ phase: error?.phase ?? 'load', reason: String(error) }));
			})
		);
	});
</script>

<div
	class="duck-stage"
	data-variant={variant}
	data-figure={figure}
	data-mode={ready ? '3d' : '2d'}
	data-pose={shown}
	data-hipster={accessoriesFor(wardrobe).beanie || undefined}
	data-phase={failure?.phase}
	data-reason={failure?.reason ?? policy ?? (!granted ? 'slot' : undefined)}
	aria-hidden="true"
>
	<div class="air" bind:this={air}>
		{#key generation}<canvas bind:this={canvas} class:interactive class:pending={!ready}
			></canvas>{/key}
		{#if !ready}<div class="still">
				<Duck2D pose={shown} />
			</div>{/if}
	</div>
	{#if variant === 'stage'}<div class="level">
			{#each Array.from({ length: cells }) as _, i (i)}<span class:on={i < level}></span>{/each}
		</div>{/if}
</div>

<style>
	.duck-stage {
		position: relative;
		width: 100%;
		height: 100%;
	}
	.duck-stage[data-variant='stage'] {
		max-width: 390px;
		margin-inline: auto;
		height: auto;
	}
	[data-variant='stage'] .air {
		aspect-ratio: 390 / 379;
		height: auto;
	}
	[data-variant='fullscreen'] {
		height: 100dvh;
	}
	[data-variant='tile'] {
		position: absolute;
		inset: 0;
	}
	.air {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
	}
	canvas,
	.still {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
	}
	canvas.interactive {
		touch-action: pan-y;
	}
	[data-variant='fullscreen'] canvas.interactive {
		touch-action: none;
	}
	.pending {
		visibility: hidden;
	}
	.still {
		pointer-events: none;
	}
	.level {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--dot-gap);
		padding-block: var(--step-2);
	}
	.level span {
		width: var(--dot-off);
		height: var(--dot-off);
		background: var(--text-muted);
	}
	.level span.on {
		background: var(--mark);
		width: var(--dot);
		height: var(--dot);
	}
</style>
