<script lang="ts">
	import 'katex/dist/katex.min.css';
	import katex from 'katex';
	import { deckKatexOptions } from './deck-formula';

	let {
		latex,
		spoken,
		active = null,
		matched = []
	}: {
		latex: string;
		spoken: string;
		/** The term in focus: dragged, hovered, selected or picked. */
		active?: string | null;
		/** Terms that are solved. */
		matched?: readonly string[];
	} = $props();

	/** A long formula shrinks until it fits its band; never below this share of its size. */
	const MIN_SCALE = 0.6;

	let frame = $state<HTMLDivElement>();
	let target = $state<HTMLSpanElement>();
	let rendered = $state(false);

	$effect(() => {
		const element = target;
		if (!element) return;
		element.replaceChildren();
		try {
			katex.render(latex, element, deckKatexOptions);
			rendered = true;
		} catch (error) {
			if (!(error instanceof katex.ParseError)) throw error;
			rendered = false;
		}
	});

	$effect(() => {
		if (!rendered || !target) return;
		for (const element of target.querySelectorAll<HTMLElement>('[data-term]')) {
			const term = element.dataset.term ?? '';
			if (term === active) element.dataset.state = 'active';
			else if (matched.includes(term)) element.dataset.state = 'matched';
			else delete element.dataset.state;
		}
	});

	// The whole formula stays on one line: at 390px the attention formula needs a smaller size.
	$effect(() => {
		const band = frame;
		const math = target;
		if (!rendered || !band || !math) return;
		const fit = () => {
			math.style.fontSize = '';
			const style = getComputedStyle(band);
			const room =
				band.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
			const width = math.getBoundingClientRect().width;
			if (room <= 0 || width <= room) return;
			math.style.fontSize = `${Math.max(MIN_SCALE, Math.floor((room / width) * 100) / 100)}em`;
		};
		fit();
		const observer = new ResizeObserver(fit);
		observer.observe(band);
		return () => observer.disconnect();
	});
</script>

<!-- The shared band (`.info-band`, layouts.css): from edge to edge on every deck and width. -->
<div class="formula info-band" role="math" aria-label={spoken} bind:this={frame}>
	<!-- KaTeX keeps a single MathML tree. The accessible label supplies the German reading. -->
	<span class="math" bind:this={target} aria-hidden="true"></span>
	{#if !rendered}<span aria-hidden="true">{spoken}</span>{/if}
</div>

<style>
	.formula {
		min-inline-size: 0;
		text-align: center;
		overflow: hidden;
		/* No sideways pan of its own: a swipe across the band turns the slide. */
		touch-action: pan-y;
	}

	.math {
		display: inline-block;
		white-space: nowrap;
	}

	/* A low phone keeps the band flat, so the slide below it keeps its room. */
	@media (max-height: 600px) {
		.formula {
			padding-block: var(--space-s);
		}
	}

	.formula :global([data-term]) {
		border-radius: var(--radius-flat);
		transition:
			background-color var(--change-time) var(--change-easing),
			color var(--change-time) var(--change-easing);
	}

	/* In focus: the plate of this area. Solved: the good status, also told by the docked bubble. */
	.formula :global([data-term][data-state='active']) {
		background: var(--type-explanation);
		color: var(--type-explanation-text);
		outline: var(--focus-width) solid var(--type-explanation);
	}

	.formula :global([data-term][data-state='matched']) {
		color: var(--status-good);
	}
</style>
