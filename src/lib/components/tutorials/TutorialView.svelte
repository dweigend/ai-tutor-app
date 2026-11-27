<script module lang="ts">
	import { progressFor, rememberProgress, type TutorialProgress } from './tutorial-progress.js';

	const places = new Map<string, TutorialProgress>();
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import type { EditorialTutorial } from '$lib/content/tutorials';
	import type { FormulaSelection } from '$lib/math';
	import { screenContext } from '$lib/memory/runtime.svelte';
	import { Fold } from '$lib/modules';
	import BackpropLab from './BackpropLab.svelte';
	import CheckStage from './CheckStage.svelte';
	import { momentsOf, momentWord } from './moments';
	import ReadStage from './ReadStage.svelte';
	import ReliefLab from './ReliefLab.svelte';
	import ValleyLab from './ValleyLab.svelte';

	let { tutorial }: { tutorial: EditorialTutorial } = $props();

	const moments = untrack(() => momentsOf(tutorial));
	/** Browser proof hook; never set by the app. */
	const hook = (globalThis as { __tutorialMoment?: string }).__tutorialMoment;
	const hooked = moments.findIndex((entry) => entry.id === hook);
	let progress = $state.raw(untrack(() => progressFor(places, tutorial.id)));
	let selectedTerm = $state.raw<FormulaSelection | null>(null);
	let index = $derived(Math.min(progress.index, moments.length - 1));
	let moment = $derived(moments[index]);
	let step = $derived(tutorial.steps[moment.step]);
	let last = $derived(index === moments.length - 1);
	const pad = (number: number) => String(number).padStart(2, '0');

	if (hooked >= 0) goTo(hooked);

	$effect(() => {
		const screen = {
			route: '/erklaerungen',
			topic: tutorial.title,
			courseId: tutorial.course.courseId,
			tutorialId: tutorial.id,
			momentId: moment.id,
			sectionId: step.id,
			sectionTitle: step.title,
			...selectedTerm
		};
		untrack(() => screenContext.setScreen(screen));
	});

	function goTo(nextIndex: number) {
		selectedTerm = null;
		progress = rememberProgress(places, tutorial.id, nextIndex, moments[nextIndex].step);
	}

	function next() {
		goTo(last ? 0 : index + 1);
		window.scrollTo({ top: 0 });
	}

	function jump(stepIndex: number) {
		if (!progress.reached.includes(stepIndex)) return;
		const first = moments.findIndex((entry) => entry.step === stepIndex);
		if (first < 0) return;
		goTo(first);
		window.scrollTo({ top: 0 });
	}

	function selectTerm(selection: FormulaSelection | null) {
		selectedTerm = selection;
	}
</script>

<div class="tutorial">
	<header>
		<h1>{tutorial.title}</h1>
		<nav class="progress" aria-label="Tutorialfortschritt">
			<span class="m-label">
				{pad(moment.step + 1)}/{pad(tutorial.steps.length)} · {momentWord(moment)}
			</span>
			<div class="dots">
				{#each tutorial.steps as entry, stepIndex (entry.id)}
					<button
						type="button"
						disabled={!progress.reached.includes(stepIndex)}
						aria-current={stepIndex === moment.step ? 'step' : undefined}
						aria-label={`Schritt ${stepIndex + 1}: ${entry.title}`}
						title={entry.title}
						onclick={() => jump(stepIndex)}
					>
						<span aria-hidden="true"></span>
					</button>
				{/each}
			</div>
		</nav>
		<h2>{step.title}</h2>
	</header>

	{#key moment.id}
		{#if moment.kind === 'read'}
			<ReadStage markdown={moment.markdown} onnext={next} ontermchange={selectTerm} />
		{:else if moment.kind === 'check'}
			<CheckStage
				course={tutorial.course}
				tutorialId={tutorial.id}
				check={moment.check}
				mode={moment.mode}
				reasoningPrompt={moment.reasoningPrompt}
				askConfidence={moment.askConfidence}
				revealMarkdown={moment.revealMarkdown}
				onnext={next}
				ontermchange={selectTerm}
			/>
		{:else if moment.kind === 'valley'}
			<ValleyLab context={step.title} onnext={next} />
		{:else if moment.lab.kind === 'softmax-attention'}
			<ReliefLab config={moment.lab} context={step.title} onnext={next} ontermchange={selectTerm} />
		{:else}
			<section class="backprop" aria-label={step.title}>
				<BackpropLab config={moment.lab} labId="{tutorial.id}-{moment.id}" />
				<button type="button" class="m-key action" data-primary-action onclick={next}>
					Weiter
				</button>
			</section>
		{/if}
	{/key}

	{#if last}
		<Fold.Root label="Quellen">
			<Fold.SourceList sources={tutorial.sources} />
		</Fold.Root>
	{/if}
</div>

<style>
	.tutorial,
	.backprop {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-m);
	}

	header {
		display: grid;
		gap: var(--space-s);
	}

	h1,
	h2 {
		margin: 0;
		text-wrap: balance;
	}

	h1 {
		font-size: var(--type-title);
		line-height: var(--line-title);
	}

	h2 {
		font-size: var(--type-question);
		font-weight: var(--font-weight-strong);
		line-height: var(--line-question);
		letter-spacing: var(--letter-question);
	}

	.progress {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		column-gap: var(--space-m);
	}

	.dots {
		display: flex;
		flex-wrap: wrap;
	}

	.dots button {
		display: grid;
		place-items: center;
		inline-size: var(--hit);
		block-size: var(--hit);
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: inherit;
		cursor: pointer;
		touch-action: manipulation;
	}

	.dots button:disabled {
		cursor: default;
	}

	.dots button > span {
		inline-size: var(--step-dot-size);
		block-size: var(--step-dot-size);
		border: var(--hairline-width) solid var(--text-muted);
		border-radius: 50%;
		background: var(--text);
	}

	.dots button:not(:disabled):hover {
		background: var(--card);
	}

	.dots button:disabled > span {
		background: transparent;
	}

	.dots button[aria-current='step'] > span {
		background: var(--grip);
		border-color: var(--grip-border);
	}

	.action {
		inline-size: 100%;
		min-block-size: var(--control);
		border-radius: var(--radius-pill);
	}
</style>
