<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { getTutorAppContext } from '$lib/api/context.svelte';
	import {
		ApiError,
		type ApiProblem,
		type ExerciseAttemptRequest,
		type ExerciseAttemptResponse
	} from '$lib/api/types';
	import type { EditorialExercise } from '$lib/content';
	import { screenContext } from '$lib/memory/runtime.svelte';
	import {
		Fader,
		Fold,
		InteractionStage as Stage,
		Raster,
		ReadAloud,
		Readout,
		RichText,
		prefersReducedMotion,
		speakRichText,
		springSamples,
		type Finding,
		type StageState
	} from '$lib/modules';
	import {
		checkLines,
		choiceAnswerText,
		choiceVoice,
		commitRoute,
		confidenceModeForHeight,
		digitsComplete,
		emptyAnswer,
		exerciseScreen,
		findingOf,
		linesText,
		paragraphs,
		speakHead,
		speakOptions,
		stageOf,
		stageOptions
	} from './stage-model';
	import { markDone } from './practice.svelte';
	import ValleyComparison from './ValleyComparison.svelte';

	interface Props {
		exercise: EditorialExercise;
		/** The list the stage was opened from; the close sign, Escape and the last "Weiter" lead there. */
		listHref: string;
		/** Whiteboard hand-over for sketch tasks, with the return address. */
		whiteboardHref: string;
	}

	let { exercise, listHref, whiteboardHref }: Props = $props();

	const tutorApp = getTutorAppContext();
	// The stage is keyed by task in the route, so these are read once per exercise.
	const { task, response, askConfidence } = untrack(() => exercise);
	const stage = untrack(() => stageOf(exercise));
	const steps = stage.steps;
	const lastAnswerIndex = steps.length - 1;
	const allSteps = stage.review ? [...steps, stage.review] : [...steps];

	let index = $state(0);
	/* answer → (confidence as its own mini step on short screens) → revealed */
	let phase = $state<'answer' | 'confidence' | 'revealed'>('answer');

	let pending = $state(false);
	let draft = $state(emptyAnswer());
	let stageSize = $state.raw({ width: 0, height: Infinity });
	// Remember overflow only at the measured size so removing the strip cannot toggle it back on.
	let inlineOverflow = $state.raw<typeof stageSize>();
	let confidenceMode = $derived(
		confidenceModeForHeight(stageSize.height, inlineOverflow === stageSize)
	);

	type Outcome =
		| { kind: 'response'; response: ExerciseAttemptResponse }
		| { kind: 'problem'; problem: ApiProblem; retryPhase: 'answer' | 'confidence' }
		| { kind: 'local'; finding: Finding | null; expected?: string };
	let outcome = $state<Outcome | null>(null);
	/** The DU line, frozen at commit time, and its voice: a sentence option reads in Archivo. */
	let yours = $state('');
	let yoursVoice = $state<'value' | 'sentence'>('value');

	let step = $derived(allSteps[index]);
	let instrument = $derived(step.instrument);
	let isAnswerStep = $derived(index === lastAnswerIndex);
	let showSources = $derived(
		phase === 'revealed' && outcome?.kind !== 'problem' && exercise.sources?.length
	);
	// The published course keeps the established task ID for exercise 1.6.
	let showValleys = $derived(
		phase === 'revealed' &&
			outcome?.kind !== 'problem' &&
			task.taskId === 'a-gd-kontrast-gradientenrichtung' &&
			isAnswerStep
	);
	let asksConfidence = $derived(isAnswerStep && askConfidence === true);
	let options = $derived(
		response.answerKind === 'choice' ? stageOptions(response.options, instrument) : []
	);
	let sketch = $derived(tutorApp.getExerciseWhiteboard(task.taskId));

	$effect(() => {
		const context = exerciseScreen(
			exercise,
			step,
			answerText(),
			draft.confidence,
			outcome?.kind,
			index > lastAnswerIndex
		);
		untrack(() => screenContext.setScreen(context));
	});

	let answerReady = $derived.by(() => {
		switch (instrument.kind) {
			case 'choice':
				return draft.choice.length > 0;
			case 'digits':
				return digitsComplete(draft.digits);
			case 'lines':
				return draft.lines.length > 0;
			case 'paper':
				return true;
			case 'sketch':
				return sketch !== null;
			case 'spectrum':
				return Fader.spectrumCommittable(draft.spectrumTouched);
		}
	});

	let confidenceInline = $derived(
		phase === 'answer' && asksConfidence && confidenceMode === 'inline'
	);
	let ready = $derived(
		phase === 'confidence'
			? draft.confidence !== undefined
			: answerReady && (!confidenceInline || draft.confidence !== undefined)
	);
	let stageState: StageState = $derived(
		phase === 'revealed' ? 'revealed' : pending ? 'pending' : ready ? 'ready' : 'open'
	);
	/* Something of an answer stands but is not sent yet: Escape asks before it drops it. */
	let dirty = $derived(
		phase !== 'revealed' &&
			(pending ||
				phase === 'confidence' ||
				draft.choice.length > 0 ||
				draft.digits !== '' ||
				draft.lines.length > 0 ||
				draft.spectrumTouched ||
				draft.confidence !== undefined)
	);
	let actionWord = $derived(
		phase === 'revealed' || instrument.kind === 'paper' ? 'Weiter' : 'Festlegen'
	);

	function answerText(): string {
		switch (instrument.kind) {
			case 'choice':
				return choiceAnswerText(options, draft.choice);
			case 'digits':
				return draft.digits ? `${draft.digits}${instrument.unit ? ` ${instrument.unit}` : ''}` : '';
			case 'lines':
				return draft.lines.length ? linesText(draft.lines) : '';
			case 'paper':
				return '';
			case 'sketch':
				return sketch ? `Skizze · ${sketch.strokes.length} Striche` : '';
			case 'spectrum': {
				if (!draft.spectrumTouched) return '';
				const reading = Fader.spectrumReading(draft.spectrum);
				return reading.certainty ? `${reading.word} · ${reading.certainty} %` : reading.word;
			}
		}
	}

	/** One chosen sentence option is read; values, digits and lines are measured (Mono). */
	function answerVoice(): 'value' | 'sentence' {
		return instrument.kind === 'choice' && draft.choice.length === 1
			? choiceVoice(instrument)
			: 'value';
	}

	function buildAnswer(): ExerciseAttemptRequest['answer'] | null {
		switch (response.answerKind) {
			case 'choice':
				return draft.choice.length ? { kind: 'choice', optionIds: [...draft.choice] } : null;
			case 'text':
				return draft.digits ? { kind: 'text', text: draft.digits } : null;
			case 'whiteboard':
				return sketch ? { kind: 'whiteboard', snapshot: sketch } : null;
			default:
				return null;
		}
	}

	// One attempt keeps its requestId until the answer changes, so resending after a lost
	// response cannot record the same attempt twice.
	let attempt: { requestId: string; fingerprint: string } | null = null;
	function attemptRequestId(fingerprint: string): string {
		if (attempt?.fingerprint !== fingerprint) {
			attempt = { requestId: crypto.randomUUID(), fingerprint };
		}
		return attempt.requestId;
	}

	let controller: AbortController | undefined;
	$effect(() => () => controller?.abort());

	async function submit() {
		const answer = buildAnswer();
		if (!answer || pending || phase === 'revealed') return;
		const retryPhase = phase;
		controller?.abort();
		controller = new AbortController();
		const payload = { answer, confidence: draft.confidence ?? undefined };
		const requestId = attemptRequestId(JSON.stringify(payload));
		pending = true;
		try {
			const result = await tutorApp.client.evaluateExercise(
				{ kind: 'exercise', requestId, task, ...payload },
				controller.signal
			);
			outcome = { kind: 'response', response: result };
			if (result.result === 'korrekt') {
				const { courseId, courseVersion, taskId } = task;
				tutorApp.recordPracticeProgress(`exercise:${courseId}@${courseVersion}:${taskId}`);
				markDone(taskId);
			}
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') return;
			outcome = {
				kind: 'problem',
				retryPhase,
				problem:
					error instanceof ApiError
						? error.problem
						: { code: 'protocol', message: 'Die Antwort ließ sich nicht prüfen.', retryable: true }
			};
		} finally {
			pending = false;
		}
		phase = 'revealed';
	}

	function commit() {
		if (!ready) return;
		// Only the answer step reaches the API; paper, line checks and the spectrum stay local.
		const route = commitRoute({ step, isAnswerStep, phase, asksConfidence, confidenceMode });
		if (route === 'hold') return;
		if (phase === 'answer') {
			yours = answerText();
			yoursVoice = answerVoice();
		}
		switch (route) {
			case 'next':
				return next();
			case 'local-lines': {
				const expected = step.localCheck?.expected ?? [];
				outcome = {
					kind: 'local',
					finding: checkLines(draft.lines, expected),
					expected: linesText(expected)
				};
				phase = 'revealed';
				return;
			}
			case 'local-spectrum':
				outcome = { kind: 'local', finding: null };
				phase = 'revealed';
				return;
			case 'confidence':
				phase = 'confidence';
				void tick().then(() =>
					stageHost?.querySelector<HTMLElement>('.confidence-rating')?.focus()
				);
				return;
			case 'submit':
				void submit();
		}
	}

	function resetAnswer() {
		draft = emptyAnswer();
		outcome = null;
		yours = '';
		yoursVoice = 'value';
		attempt = null;
		inlineOverflow = undefined;
		phase = 'answer';
	}

	function next() {
		// A failed send keeps the answer and its requestId; the learner sends again.
		if (outcome?.kind === 'problem') {
			phase = outcome.retryPhase;
			outcome = null;
			return;
		}
		if (index + 1 < allSteps.length) {
			index += 1;
			resetAnswer();
			return;
		}
		void goto(listHref);
	}

	let stageHost = $state<HTMLElement>();
	$effect(() => {
		const form = stageHost?.querySelector('form');
		if (!form) return;
		const measure = () => {
			const { clientWidth: width, clientHeight: height } = form;
			untrack(() => {
				if (width !== stageSize.width || height !== stageSize.height) {
					stageSize = { width, height };
				}
			});
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(form);
		return () => observer.disconnect();
	});

	// A long instrument can need a separate confidence step even on a tall stage.
	$effect(() => {
		if (!stageHost || !confidenceInline) return;
		void index;
		const zone = stageHost.querySelector<HTMLElement>('[data-zone="instrument"]');
		if (!zone) return;
		const size = stageSize;
		const check = () => {
			if (zone.scrollHeight > zone.clientHeight + 1) inlineOverflow = size;
		};
		check();
		const observer = new ResizeObserver(check);
		observer.observe(zone);
		return () => observer.disconnect();
	});

	/*
	 * Step → step: a hard horizontal wipe across one full width (DESIGN.md §4.5), no fade. The new
	 * head and instrument are uncovered from the right edge on the snap spring; with reduced
	 * motion the change is immediate. The first step appears without a wipe.
	 */
	let shownIndex = untrack(() => index);
	$effect(() => {
		const current = index;
		if (!stageHost || current === shownIndex) return;
		shownIndex = current;
		if (prefersReducedMotion()) return;
		const samples = springSamples('snap');
		const clipPath = samples.map(
			(progress) => `inset(0 0 0 ${((1 - progress) * 100).toFixed(2)}%)`
		);
		const timing = { duration: ((samples.length - 1) * 1000) / 60, easing: 'linear' };
		const zones = stageHost.querySelectorAll<HTMLElement>(
			'.stage-head, .stage-instrument, .stage-aside'
		);
		const runs = [...zones].map((zone) => zone.animate({ clipPath }, timing));
		return () => runs.forEach((run) => run.cancel());
	});

	let finding = $derived.by((): Finding | null => {
		if (!outcome) return null;
		if (outcome.kind === 'response') return findingOf(outcome.response.result);
		if (outcome.kind === 'problem') return 'open';
		return outcome.finding;
	});
	let because = $derived(
		outcome?.kind === 'response'
			? outcome.response.feedback
			: outcome?.kind === 'problem'
				? outcome.problem.message
				: ''
	);
	let confidenceReading = $derived(
		isAnswerStep && askConfidence ? Fader.confidenceShort(draft.confidence) : undefined
	);
	let revealSay = $derived(
		[
			`Du: ${speakRichText(yours)}`,
			confidenceReading,
			finding && `Befund: ${Readout.FINDING_WORDS[finding]}`,
			because
		]
			.filter(Boolean)
			.join('. ')
	);
</script>

<div class="exercise-stage" bind:this={stageHost}>
	<Stage.Root
		state={stageState}
		step={index + 1}
		steps={allSteps.length}
		label={stage.title ?? exercise.title}
		oncommit={commit}
		onexit={() => void goto(listHref)}
		{dirty}
	>
		<Stage.Meter href={listHref} />

		<!-- A new step is a new head: its ReadAloud segment leaves, so old speech stops at once. -->
		{#key step.id}
			<Stage.Head say={speakHead(step)}>
				{#if step.context}<Stage.Context text={step.context} />{/if}
				<Stage.Prompt text={step.ask} />
				{#if step.facts && !showValleys}<Stage.Facts facts={step.facts} />{/if}
			</Stage.Head>
		{/key}

		{#if step.more || showSources}
			<Stage.More>
				{#if step.more}
					{#each paragraphs(step.more) as paragraph (paragraph)}
						<p class="stage-more-text">{paragraph}</p>
					{/each}
				{/if}
				{#if showSources && exercise.sources}
					<section aria-label="Quellen">
						<p class="m-label">Quellen</p>
						<Fold.SourceList sources={exercise.sources} />
					</section>
				{/if}
			</Stage.More>
		{/if}

		{#key step.id}
			{#if phase === 'revealed'}
				<Stage.Reveal
					{yours}
					voice={yoursVoice}
					confidence={confidenceReading}
					{finding}
					expected={outcome?.kind === 'local' ? outcome.expected : undefined}
					say={revealSay}
				>
					{#if showValleys}<ValleyComparison />{/if}
					{#if because}<p><RichText text={because} /></p>{/if}
				</Stage.Reveal>
			{:else if phase === 'confidence'}
				<Stage.Instrument label="Sicherheit">
					<div class="confidence-step">
						<Readout.Verdict {yours} voice={yoursVoice} finding={null} />
						<Fader.ConfidenceStrip bind:value={draft.confidence} disabled={pending} />
					</div>
				</Stage.Instrument>
			{:else}
				<Stage.Instrument label="Antwort" bleed={instrument.kind === 'spectrum'}>
					{#if instrument.kind === 'choice'}
						<ReadAloud.Segment as="div" say={speakOptions(options)}>
							<Raster.ChoiceGrid
								{options}
								type={response.answerKind === 'choice' && response.multiple ? 'multiple' : 'single'}
								layout={instrument.layout}
								voice={choiceVoice(instrument)}
								bind:value={draft.choice}
								disabled={pending}
								label={step.ask}
							/>
						</ReadAloud.Segment>
					{:else if instrument.kind === 'digits'}
						<Raster.DigitPad
							bind:value={draft.digits}
							decimals={instrument.decimals}
							signed={instrument.signed}
							unit={instrument.unit}
							label={step.ask}
							disabled={pending}
						/>
					{:else if instrument.kind === 'lines'}
						<ReadAloud.Segment
							as="div"
							say="Codebeispiel, {instrument.code.split('\n').length} Zeilen"
						>
							<Raster.LinePick
								code={instrument.code}
								bind:value={draft.lines}
								max={instrument.max}
								label={step.ask}
							/>
						</ReadAloud.Segment>
					{:else if instrument.kind === 'sketch'}
						<div class="sketch-handover">
							<p class="sketch-state">
								{#if sketch}
									Deine vorgemerkte Skizze wird abgegeben:
									<span class="sketch-count">{sketch.strokes.length} Striche</span>
								{:else}
									Diese Aufgabe beantwortest du mit einer Skizze.
								{/if}
							</p>
							<a class="m-hit m-keyword sketch-link" href={whiteboardHref}>Zum Whiteboard</a>
						</div>
					{:else if instrument.kind === 'spectrum'}
						<Fader.SpectrumSlider
							bind:value={draft.spectrum}
							bind:touched={draft.spectrumTouched}
							label={step.ask}
						/>
					{/if}
				</Stage.Instrument>
			{/if}
		{/key}

		{#if confidenceInline}
			<Stage.Aside>
				<Fader.ConfidenceStrip bind:value={draft.confidence} disabled={pending} />
			</Stage.Aside>
		{/if}

		{#if phase === 'revealed'}
			<Stage.Action type="button" disabled={false} onclick={next}>Weiter</Stage.Action>
		{:else}
			<Stage.Action>{actionWord}</Stage.Action>
		{/if}
	</Stage.Root>
</div>

<style>
	.confidence-step {
		display: grid;
		align-content: start;
		gap: var(--step-4);
	}

	.sketch-handover {
		display: grid;
		align-content: start;
		justify-items: start;
		gap: var(--step-3);
	}

	.sketch-state {
		margin: 0;
	}

	.sketch-count {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}

	.sketch-link {
		padding-inline: var(--step-4);
		border: var(--hairline-width) solid var(--hairline);
	}
</style>
