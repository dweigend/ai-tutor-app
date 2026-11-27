<script lang="ts">
	import type { FormulaSelection } from '$lib/math';
	import { FINDING_WORDS } from '$lib/modules/readout/finding';
	import { markdownSpoken } from './markdown';
	import { getTutorAppContext } from '$lib/api/context.svelte';
	import { ApiError } from '$lib/api/types';
	import type {
		CheckResult,
		CourseRef,
		TutorialCheckRequest,
		TutorialCheckResponse
	} from '$lib/api/types';
	import type { TutorialCheck } from '$lib/content/types';
	import {
		Fader,
		InteractionStage as Stage,
		Raster,
		RichText,
		type Confidence,
		type Finding,
		type StageState
	} from '$lib/modules';
	import Markdown from './Markdown.svelte';

	interface Props {
		course: CourseRef;
		tutorialId: string;
		check: TutorialCheck;
		/** prediction: one binding answer, then the reveal. quiz: again until it holds. */
		mode: 'prediction' | 'quiz';
		reasoningPrompt?: string;
		askConfidence?: boolean;
		revealMarkdown?: string;
		onnext: () => void;
		onresult?: (response: TutorialCheckResponse) => void;
		ontermchange?: (selection: FormulaSelection | null) => void;
	}

	let {
		course,
		tutorialId,
		check,
		mode,
		reasoningPrompt,
		askConfidence = false,
		revealMarkdown,
		onnext,
		onresult,
		ontermchange
	}: Props = $props();

	const tutorApp = getTutorAppContext();
	const FINDING: Record<CheckResult, Finding> = {
		korrekt: 'match',
		teilweise: 'partial',
		falsch: 'deviates'
	};
	/** Option values up to 14 characters sit in a 2 × 2 grid, sentences in rows (§10.1). */
	const SHORT_OPTION = 14;

	let choice = $state<string[]>([]);
	let digits = $state('');
	let reasoning = $state('');
	let confidence = $state<Confidence>(undefined);
	let pending = $state(false);
	let response = $state.raw<TutorialCheckResponse | null>(null);
	let problem = $state<string | null>(null);
	// A retry after a failed request reuses the request ID, so the server can deduplicate it.
	let lastAttempt: { requestId: string; key: string; failed: boolean } | null = null;
	let controller: AbortController | null = null;

	let options = $derived(
		check.answerKind === 'choice'
			? check.options.map((option) => ({ id: option.id, label: option.label }))
			: []
	);
	let layout = $derived(
		options.length <= 4 && options.every((option) => option.label.length <= SHORT_OPTION)
			? ('grid' as const)
			: ('rows' as const)
	);
	let answer = $derived<TutorialCheckRequest['answer'] | null>(
		check.answerKind === 'choice'
			? choice.length
				? { kind: 'choice', optionIds: [...choice] }
				: null
			: digits.trim() && digits !== '-'
				? { kind: 'text', text: digits.trim() }
				: null
	);
	let confidenceDone = $derived(!askConfidence || confidence !== undefined);
	let stageState = $derived<StageState>(
		response ? 'revealed' : pending ? 'pending' : answer && confidenceDone ? 'ready' : 'open'
	);
	let yours = $derived(
		check.answerKind === 'choice'
			? options
					.filter((option) => choice.includes(option.id))
					.map((option) => option.label)
					.join(' · ')
			: digits.replace('-', '−')
	);
	let finding = $derived(response ? FINDING[response.result] : null);
	let revealSay = $derived(
		response &&
			[
				`Du: ${yours}.`,
				askConfidence ? Fader.confidenceShort(confidence) : '',
				finding ? `Befund: ${FINDING_WORDS[finding]}.` : '',
				markdownSpoken(response.feedback),
				revealMarkdown ? markdownSpoken(revealMarkdown) : ''
			]
				.filter(Boolean)
				.join(' ')
	);
	let again = $derived(mode === 'quiz' && response !== null && response.result !== 'korrekt');

	$effect(() => () => controller?.abort());

	function requestIdFor(key: string): string {
		if (lastAttempt?.failed && lastAttempt.key === key) return lastAttempt.requestId;
		return crypto.randomUUID();
	}

	async function commit() {
		if (!answer || pending || response) return;
		const key = JSON.stringify(answer);
		const requestId = requestIdFor(key);
		lastAttempt = { requestId, key, failed: false };
		controller = new AbortController();
		pending = true;
		problem = null;
		try {
			const result = await tutorApp.client.checkTutorial(
				{ kind: 'tutorial', requestId, course, tutorialId, checkId: check.id, answer },
				controller.signal
			);
			response = result;
			if (result.result === 'korrekt') {
				// App-wide key: the same check counts once, even after leaving and coming back.
				tutorApp.recordPracticeProgress(
					`tutorial:${course.courseId}@${course.courseVersion}:${tutorialId}:${check.id}`
				);
			}
			onresult?.(result);
		} catch (error) {
			if (controller.signal.aborted) return;
			lastAttempt = { requestId, key, failed: true };
			problem =
				error instanceof ApiError
					? error.problem.message
					: 'Die Prüfung ist fehlgeschlagen. Bitte versuche es erneut.';
		} finally {
			pending = false;
		}
	}

	/** Quiz only: the answer did not hold; the same question opens again. */
	function retry() {
		response = null;
		choice = [];
		digits = '';
	}
</script>

<div class="check-stage">
	<Stage.Root
		state={stageState}
		label={check.prompt}
		oncommit={commit}
		dirty={stageState === 'ready'}
	>
		<Stage.Head say={markdownSpoken(check.prompt)}>
			<Stage.Prompt text={check.prompt} />
		</Stage.Head>

		{#if response}
			<Stage.Reveal
				{yours}
				voice={check.answerKind === 'choice' && layout === 'rows' ? 'sentence' : 'value'}
				confidence={askConfidence ? Fader.confidenceShort(confidence) : undefined}
				{finding}
				say={revealSay ?? undefined}
			>
				<p><RichText text={response.feedback} /></p>
				{#if revealMarkdown}<Markdown source={revealMarkdown} {ontermchange} />{/if}
			</Stage.Reveal>
		{:else}
			<Stage.Instrument label="Antwort">
				{#if check.answerKind === 'choice'}
					<Raster.ChoiceGrid
						{options}
						type={check.multiple ? 'multiple' : 'single'}
						{layout}
						bind:value={choice}
						disabled={pending}
						label={check.prompt}
					/>
				{:else}
					<Raster.DigitPad bind:value={digits} decimals={0} signed label={check.prompt} />
				{/if}
				{#if reasoningPrompt}
					<label class="reasoning">
						<span>Begründung · bleibt bei dir</span>
						<span>{reasoningPrompt}</span>
						<textarea bind:value={reasoning} name="reasoning" autocomplete="off" rows="2"
						></textarea>
					</label>
				{/if}
			</Stage.Instrument>
		{/if}

		{#if askConfidence || problem}
			<Stage.Aside active={!response}>
				{#if problem}
					<p class="problem" role="alert">{problem}</p>
				{:else}
					<Fader.ConfidenceStrip bind:value={confidence} disabled={pending} />
				{/if}
			</Stage.Aside>
		{/if}

		{#if response}
			<Stage.Action type="button" disabled={false} onclick={again ? retry : onnext}>
				{again ? 'Nochmal' : 'Weiter'}
			</Stage.Action>
		{:else}
			<Stage.Action>{mode === 'prediction' ? 'Festlegen' : 'Prüfen'}</Stage.Action>
		{/if}
	</Stage.Root>
</div>

<style>
	.check-stage {
		--gutter: 0px;
		min-inline-size: 0;
	}

	.check-stage :global(.stage) {
		block-size: auto;
		max-inline-size: none;
		padding-block: 0;
	}
	.reasoning {
		display: grid;
		gap: var(--space-s);
		margin-block-start: var(--space-m);
		max-inline-size: 65ch;
	}

	.reasoning textarea {
		inline-size: 100%;
		padding: var(--step-2) var(--step-3);
		border: var(--hairline-width) solid var(--hairline);
		border-radius: var(--radius-option);
		background: var(--well);
		color: var(--text);
		font: inherit;
		resize: vertical;
	}

	.problem {
		margin: 0;
		padding-inline-start: var(--step-2);
		border-inline-start: var(--edge-width) solid var(--palette-signal-crimson);
	}
</style>
