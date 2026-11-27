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
		BottomBar,
		Fader,
		Fold,
		InteractionStage as Stage,
		PageHead,
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
		attemptResult,
		countsAsTaskCompletion,
		checkLines,
		choiceAnswerText,
		choiceVoice,
		commitRoute,
		confidenceFigure,
		confidenceModeForHeight,
		digitsComplete,
		emptyAnswer,
		exerciseScreen,
		linesText,
		liveAnswer,
		LOCKED_TASK_PROBLEM,
		paragraphs,
		RECEIVED_WORD,
		revealStatus,
		type RevealStatus,
		speakHead,
		speakOptions,
		stageOf,
		stageOptions,
		visibleInMode
	} from './stage-model';
	import { markDone } from './practice.svelte';
	import SketchAnswer from './SketchAnswer.svelte';
	import ValleyComparison from './ValleyComparison.svelte';

	interface Props {
		exercise: EditorialExercise;
		/** The list the stage was opened from; the close sign, Escape and the last "Weiter" lead there. */
		listHref: string;
	}

	let { exercise, listHref }: Props = $props();

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
	/** Lines picked on an earlier LinePick step; a live text answer carries them along. */
	let pickedLines = $state<string[]>([]);

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
	/*
	 * Confidence is optional (V4-5): the slider rests in its marked middle, "ohne Angabe". Only the
	 * answer itself unlocks "Festlegen".
	 */
	let ready = $derived(phase === 'confidence' || answerReady);
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
		const answer = apiAnswer();
		if (!answer) return null;
		return liveAnswer(task.taskId, tutorApp.config.mode, answer, {
			lines: pickedLines,
			choice: choiceAnswerText(options, draft.choice)
		});
	}

	function apiAnswer(): ExerciseAttemptRequest['answer'] | null {
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

	let attemptSession: { sessionId?: string } = {};
	$effect(() => {
		// Switching backends also starts a fresh binding.
		const sessions = tutorApp.exerciseSessions;
		attemptSession = sessions.beginAttempt(task);
	});
	let controller: AbortController | undefined;
	$effect(() => () => controller?.abort());

	async function submit() {
		const answer = buildAnswer();
		if (!answer || pending || phase === 'revealed') return;
		const retryPhase = phase;
		// A locked Modul-2 task (AP6) never reaches the live grader, even when its stage is open.
		if (!visibleInMode(task.taskId, tutorApp.config.mode)) {
			outcome = { kind: 'problem', retryPhase, problem: LOCKED_TASK_PROBLEM };
			phase = 'revealed';
			return;
		}
		controller?.abort();
		controller = new AbortController();
		const payload = {
			...(step.id === 'abruf' && { stepId: 'abruf' as const }),
			sessionId: attemptSession.sessionId,
			answer,
			confidence: draft.confidence ?? undefined
		};
		const requestId = attemptRequestId(JSON.stringify(payload));
		pending = true;
		try {
			const result = await tutorApp.client.evaluateExercise(
				{ kind: 'exercise', requestId, task, ...payload },
				controller.signal
			);
			outcome = { kind: 'response', response: result };
			// Only `korrekt` is mastery; a received sketch (fourth state) stays open in the list.
			if (countsAsTaskCompletion(result)) {
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
				pickedLines = [...draft.lines];
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
					stageHost?.querySelector<HTMLElement>('.confidence [role="slider"]')?.focus()
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
		tutorApp.exerciseSessions.reset(task);
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
			'.exercise-band, .stage-head, .stage-instrument, .stage-aside'
		);
		const runs = [...zones].map((zone) => zone.animate({ clipPath }, timing));
		return () => runs.forEach((run) => run.cancel());
	});

	/* What the reveal shows: a finding, or the neutral "Eingereicht" of the fourth evidence state. */
	let status = $derived.by((): RevealStatus | null => {
		if (!outcome) return null;
		if (outcome.kind === 'response') return revealStatus(attemptResult(outcome.response));
		if (outcome.kind === 'problem') return 'open';
		return outcome.finding;
	});
	let finding = $derived(status === 'received' ? null : (status as Finding | null));
	let statusWord = $derived(
		status === 'received' ? RECEIVED_WORD : status ? Readout.FINDING_WORDS[status] : ''
	);
	let because = $derived.by(() => {
		if (outcome?.kind === 'problem') return outcome.problem.message;
		if (outcome?.kind !== 'response') return '';
		if (
			attemptResult(outcome.response) === 'korrekt' &&
			!countsAsTaskCompletion(outcome.response)
		) {
			return 'Zahl stimmt. ' + outcome.response.feedback;
		}
		if (stage.correctFeedback && attemptResult(outcome.response) === 'korrekt') {
			return stage.correctFeedback;
		}
		return outcome.response.feedback;
	});
	/* Only a chosen figure stands beside the answer; "ohne Angabe" is not written out. */
	let confidenceReading = $derived(
		isAnswerStep && askConfidence ? confidenceFigure(draft.confidence) : undefined
	);
	let revealSay = $derived(
		[
			`Du: ${speakRichText(yours)}`,
			isAnswerStep && askConfidence ? Fader.confidenceShort(draft.confidence ?? null) : undefined,
			statusWord && `Befund: ${statusWord}`,
			because
		]
			.filter(Boolean)
			.join('. ')
	);
</script>

<div class="exercise-stage" data-layout="stage" bind:this={stageHost}>
	<!-- One head for list and task: round back key, wordless dots, the corner stays for home. -->
	<PageHead
		accent="exercise"
		backHref={listHref}
		step={allSteps.length > 1 ? index + 1 : undefined}
		total={allSteps.length > 1 ? allSteps.length : undefined}
	/>
	<Stage.Root
		state={stageState}
		step={index + 1}
		steps={allSteps.length}
		label={stage.title ?? exercise.title}
		oncommit={commit}
		onexit={() => void goto(listHref)}
		{dirty}
	>
		<!-- Task data (formula, start value, programs) in one full-width band, no frame, no kicker. -->
		{#key step.id}
			{#if (step.context || step.facts) && !showValleys}
				<div class="info-band exercise-band" data-row>
					{#if step.context}
						<p class="exercise-band-context"><RichText text={step.context} /></p>
					{/if}
					{#if step.facts}<Readout.Facts facts={step.facts} />{/if}
				</div>
			{/if}
		{/key}

		<!-- A new step is a new head: its ReadAloud segment leaves, so old speech stops at once. -->
		{#key step.id}
			<Stage.Head say={speakHead(step)}>
				<Stage.Prompt text={step.ask} />
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
					expected={outcome?.kind === 'local' && outcome.finding !== 'match'
						? outcome.expected
						: undefined}
					say={revealSay}
				>
					{#if status === 'received'}
						<!-- Fourth evidence state: received, not judged. Neutral, never partial or a match. -->
						<p class="exercise-received" data-status="received">{RECEIVED_WORD}</p>
					{/if}
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
				<Stage.Instrument
					label="Antwort"
					bleed={instrument.kind === 'spectrum' || instrument.kind === 'sketch'}
				>
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
						<SketchAnswer taskId={task.taskId} disabled={pending} />
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

		<!-- The one action sits in the shared bottom bar, centred in the room left of the duck. -->
		<BottomBar class="exercise-bar">
			{#if phase === 'revealed'}
				<Stage.Action type="button" disabled={false} onclick={next}>Weiter</Stage.Action>
			{:else}
				<Stage.Action>{actionWord}</Stage.Action>
			{/if}
		</BottomBar>
	</Stage.Root>
</div>

<style>
	/*
	 * One calm stage for every task type (V4-5): the shared PageHead on top, the task band under
	 * it across the full width, the stage in its reading rail, one action in the shared bottom bar.
	 */
	.exercise-stage {
		grid-template-rows: auto minmax(0, 1fr);
		align-content: stretch;
		justify-items: stretch;
		block-size: 100dvh;
		overflow-x: clip;
	}

	.exercise-stage :global(.stage) {
		inline-size: 100%;
		block-size: 100%;
		max-block-size: none;
		padding-block-start: 0;
	}

	/* The task band: the shared .info-band, edge to edge of the screen, text on the rail. */
	.exercise-band {
		display: grid;
		grid-area: meter;
		gap: var(--space-s);
		inline-size: auto;
		margin-inline: calc(50% - 50vw);
		padding-inline: calc(50vw - 50% + var(--gutter));
	}

	.exercise-band-context {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--type-meta);
		line-height: var(--line-meta);
	}

	.exercise-band :global(.readout-facts) {
		overflow-x: auto;
	}

	/* Code lines and numbers: one voice; JetBrains Mono only where [data-code] says so. */
	.exercise-stage :global(.stage-prompt) {
		font-family: var(--font-ui);
	}

	/*
	 * "Mehr" is one clear round button under the question, no word: 40 px, ink ring, ink sign. The
	 * trigger keeps its accessible name "Mehr öffnen", the label stays for screen readers only.
	 */
	.exercise-stage :global(.stage-more > .fold-trigger) {
		justify-content: center;
		align-items: center;
		justify-self: start;
		inline-size: 2.5rem;
		block-size: 2.5rem;
		margin-inline-start: var(--gutter);
		padding: 0;
		border: 2px solid var(--text);
		border-radius: 50%;
		background: var(--surface);
		color: var(--text);
	}

	.exercise-stage :global(.stage-more > .fold-trigger:hover),
	.exercise-stage :global(.stage-more > .fold-trigger[data-state='open']) {
		background: var(--text);
		color: var(--surface);
	}

	.exercise-stage :global(.stage-more .fold-label) {
		position: absolute;
		inline-size: 1px;
		block-size: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.exercise-stage :global(.stage-more .fold-sign) {
		display: grid;
		place-items: center;
		font-size: 1.5rem;
		font-weight: 600;
	}

	/* The question lies on the stage's paper on every screen, never inside the task band. */
	.exercise-stage :global(.stage-head) {
		background: var(--surface);
	}

	/* The bottom bar spans the screen; on wide screens it keeps the same room on both sides. */
	.exercise-stage :global(.exercise-bar) {
		justify-content: center;
	}

	@media (min-width: 40rem) {
		.exercise-stage :global(.exercise-bar) {
			inset-inline-start: var(--corner-clearance);
		}
	}

	.exercise-stage :global(.exercise-bar .stage-action) {
		flex: 1;
		inline-size: 100%;
		max-inline-size: var(--exercise-rail);
		margin: 0;
	}

	/* The leave question takes the bottom zone; the bar steps aside while it is open. */
	.exercise-stage:has(:global(.stage-leave)) :global(.exercise-bar) {
		visibility: hidden;
	}

	/* The verdict speaks in colour, not in capitals: DU and BEFUND stay for screen readers only. */
	.exercise-stage :global(.readout-verdict-rows) {
		gap: var(--space-s);
		border: 0;
		background: transparent;
	}

	.exercise-stage :global(.readout-verdict-row) {
		grid-template-columns: minmax(0, 1fr);
		border-radius: var(--radius-option);
		padding-inline: var(--space-m);
	}

	.exercise-stage :global(.readout-verdict-row > dt) {
		position: absolute;
		inline-size: 1px;
		block-size: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	/*
	 * Feedback in colour, not in more words: the system green for a match, crimson for a deviation.
	 * A match shows only the word; the chosen answer already stands in the row above.
	 */
	.exercise-stage :global(.readout-verdict-row[data-finding='match']) {
		background: var(--status-good);
		color: var(--status-good-text);
	}

	.exercise-stage :global(.readout-verdict-row[data-finding] .readout-verdict-word) {
		background: transparent;
		color: inherit;
	}

	.exercise-stage :global(.readout-verdict-row[data-finding='partial']) {
		background: var(--status-mid);
		color: var(--status-mid-text);
	}

	.exercise-stage :global(.readout-verdict-row[data-finding='deviates']) {
		background: var(--status-bad);
		color: var(--status-bad-text);
	}

	/* Not judged (a failed request) and received (fourth evidence state): neutral, never green. */
	.exercise-stage :global(.readout-verdict-row[data-finding='open']),
	.exercise-received {
		background: var(--status-neutral);
		color: var(--status-neutral-text);
	}

	.exercise-received {
		display: flex;
		align-items: center;
		min-block-size: var(--cell);
		margin: 0;
		padding: var(--step-2) var(--space-m);
		border-radius: var(--radius-option);
		font-size: var(--type-body);
		font-weight: var(--font-weight-strong);
	}

	.exercise-stage :global(.readout-verdict-row[data-finding] .readout-verdict-deviation) {
		background: transparent;
		color: inherit;
	}

	@media (prefers-reduced-motion: no-preference) {
		.exercise-stage :global(.readout-verdict-row[data-finding='match']) {
			animation: good-flash 600ms var(--change-easing) both;
		}
	}

	/* A short bright flash settles on the system green; each end keeps its own legible ink. */
	@keyframes good-flash {
		from {
			background: var(--status-good-flash);
			color: var(--status-good-flash-text);
		}
	}

	.confidence-step {
		display: grid;
		align-content: start;
		gap: var(--step-4);
	}
</style>
