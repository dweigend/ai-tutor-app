<script lang="ts">
	import { onDestroy, tick, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { getTutorAppContext } from '$lib/api/context.svelte';
	import { learningMemory } from '$lib/memory/runtime.svelte';
	import { ApiError } from '$lib/api/types';
	import type {
		ApiProblem,
		TutorApiClient,
		TutorInput,
		TutorSession as SessionInfo,
		TutorTurnRequest,
		TutorTurnResponse
	} from '$lib/api/types';
	import { tutorScenarios } from '$lib/content/tutor';
	import { tutorScope } from '$lib/api/types';
	import type { TutorScenario } from '$lib/content/types';
	import DuckStage from '$lib/components/duck/DuckStage.svelte';
	import {
		idleAllowed,
		poseForPhase,
		reactionFor,
		type DuckPhase
	} from '$lib/components/duck/triggers';
	import DuckChip from '$lib/components/duck/DuckChip.svelte';
	import {
		HIPSTER_OFF_LINE,
		HIPSTER_ON_LINE,
		createTapBurst,
		pullDistance,
		rubberBand,
		swipeOutcome
	} from '$lib/components/duck/gesture';
	import { duckWardrobe } from '$lib/components/duck/wardrobe.svelte';
	import type { DuckPose } from '$lib/figures';
	import { BottomBar, Icon, IconButton, RichText, animate, type Animation } from '$lib/modules';
	import { ScreenContextStore } from '$lib/memory';
	import ArtifactOverlay from './ArtifactOverlay.svelte';
	import TutorSpeech from './TutorSpeech.svelte';
	import Dictation from './Dictation.svelte';
	import type { TutorArtifact } from '$lib/api/types';

	import { topDrawer } from '$lib/components/shell/top-drawer.svelte';
	const drawer = topDrawer();
	$effect(() => drawer.registerSection(tutorControls));
	import { advance, draftInput, startCursor, type DraftMode, type ScriptCursor } from './script';
	import {
		acceptsTurn,
		requiresConsentRestart,
		clearSession,
		loadSession,
		saveSession,
		type SavedSession
	} from './sessionStore';
	import Transcript from './Transcript.svelte';
	import {
		rejectedByServer,
		type LearnerEntry,
		type LearnerVia,
		type LiveTurn,
		type TranscriptEntry
	} from './types';

	interface Props {
		scenario: TutorScenario;
		/** Only the visible session offers the pending whiteboard sketch. */
		active: boolean;
		/** Pulling the duck down leaves the fullscreen tutor. */
		onleave?: () => void;
	}

	let { scenario, active, onleave }: Props = $props();

	const tutorApp = getTutorAppContext();

	/* Fixed lines of the duck (textredaktion-v2.md §3). */
	const BOUNDARY_LINE = 'Den Schritt machst du selbst – womit fängst du an?';
	const WAIT_LINE = 'Alles klar, lass dir Zeit.';
	const CLOSING_LINE = 'Alles klar – sitzt für heute.';

	const EXAMPLE_REQUEST = 'Zeigst du mir ein anderes Beispiel?';

	// A trip to the whiteboard unmounts this page; the session for this scenario picks up again,
	// unless the client changed meanwhile.
	const saved = untrack(() => loadSession(scenario.id, tutorApp.client));

	let sessionId = $state(saved?.sessionId ?? crypto.randomUUID());
	let revision = $state(saved?.revision ?? 0);
	let sessionState = $state.raw<SessionInfo['state'] | null>(saved?.sessionState ?? null);
	let cursor = $state.raw<ScriptCursor>(saved?.cursor ?? untrack(() => startCursor(scenario)));
	let entries = $state<TranscriptEntry[]>(saved?.entries ?? []);
	let live = $state<LiveTurn | null>(saved?.live ?? null);
	let draft = $state(saved?.draft ?? '');
	let confidence = $state<number | undefined>(saved?.confidence);
	/* Free question or guess by default; only an explicit hand-in is graded (Didaktik #3). */
	let mode = $state<DraftMode>(saved?.mode ?? 'message');
	let announcement = $state('');
	let reaction = $state<DuckPose | null>(null);
	let speechLevel = $state(0);
	let artifact = $state.raw<TutorArtifact | null>(null);
	let expanded = $state(false),
		panel = $state<'history' | null>(null);
	let listening = $derived(expanded && draft.length > 0);
	let duck: HTMLButtonElement;
	let field = $state<HTMLInputElement>();
	let dragged = false,
		press: { id: number; x: number; y: number } | undefined;
	/* Pull down to leave: the duck follows the finger with resistance, then springs back. */
	let drop = $state(0),
		spring: Animation | undefined;
	/* Easter egg: three quick taps, or H on the focused duck, toggle the hipster look. */
	const burst = createTapBurst();
	let reactionCue = $state(0),
		quip = $state(''),
		quipTimer: ReturnType<typeof setTimeout> | undefined;
	const screen = new ScreenContextStore();
	let activity = $state(0);
	function interaction() {
		activity++;
	}
	$effect(() => {
		void activity;
		if (!expanded || draft.trim() || live || panel || artifact || sketch) return;
		const timer = setTimeout(() => {
			if (!document.querySelector('[role="dialog"]') && document.activeElement === field) close();
		}, 30000);
		return () => clearTimeout(timer);
	});
	onDestroy(() => {
		spring?.stop();
		clearTimeout(quipTimer);
	});
	$effect(() => {
		screen.setScreen({
			route: '/tutor',
			taskRef: scenario.task ?? undefined,
			courseId: (scenario.task ? scenario.task : scenario.course).courseId,
			topic: scenario.title
		});
	});
	function hipster() {
		const on = duckWardrobe.toggleHipster();
		reaction = on ? 'celebrate' : 'giggle';
		reactionCue++;
		quip = on ? HIPSTER_ON_LINE : HIPSTER_OFF_LINE;
		announcement = quip;
		clearTimeout(quipTimer);
		quipTimer = setTimeout(() => (quip = ''), 3500);
	}
	function pressDuck(e: PointerEvent) {
		if (e.button !== 0) return;
		spring?.stop();
		press = { id: e.pointerId, x: e.clientX, y: e.clientY };
		dragged = false;
	}
	function moveDuck(e: PointerEvent) {
		if (press?.id !== e.pointerId) return;
		const dx = e.clientX - press.x,
			dy = e.clientY - press.y;
		if (Math.hypot(dx, dy) > 5) dragged = true;
		drop = Math.abs(dy) > Math.abs(dx) ? rubberBand(pullDistance(dy, 'down')) : 0;
	}
	function releaseDuck(e: PointerEvent, cancelled = false) {
		if (press?.id !== e.pointerId) return;
		const outcome = cancelled
			? 'rebound'
			: swipeOutcome(e.clientX - press.x, e.clientY - press.y, 'down');
		press = undefined;
		if (outcome === 'commit') onleave?.();
		spring = animate({
			from: drop,
			to: 0,
			preset: 'carry',
			restDelta: 0.5,
			onUpdate: (value) => (drop = value)
		});
	}
	function tapDuck(e: MouseEvent) {
		if (e.detail && dragged) return;
		const now = performance.now(),
			// Taps of one quick burst never close the bar; the third one is the easter egg.
			quick = burst.since(now) < 450;
		if (burst.tap(now)) hipster();
		else if (!expanded) void open();
		else if (!quick) close(e.detail > 0);
	}
	async function open() {
		expanded = true;
		await tick();
		field?.focus();
	}
	/* Focus returns to the duck. After a tap it shows no focus mark: only the keyboard gets one. */
	function close(byPointer = false) {
		artifact = null;
		expanded = false;
		panel = null;
		duck.focus(byPointer ? { focusVisible: false } : undefined);
	}
	function escape(e: KeyboardEvent) {
		if (
			e.key === 'Escape' &&
			expanded &&
			!e.defaultPrevented &&
			!(e.target instanceof Element && e.target.closest('[role="dialog"]'))
		)
			close();
	}
	let controller: AbortController | null = null;
	let boundClient: TutorApiClient | null = saved?.boundClient ?? null;

	let busy = $derived(live !== null);
	let sketch = $derived(active ? tutorApp.getPendingWhiteboard(scenario.id) : null);
	let started = $derived(entries.some((entry) => entry.kind !== 'note') || live !== null);
	let lastReply = $derived(
		entries.findLast((entry) => entry.kind === 'tutor' || entry.kind === 'wait')
	);
	let needsRestart = $derived(
		!!live && requiresConsentRestart(live.request, tutorApp.config.mode, tutorApp.shareWithApi)
	);
	let rejected = $derived(live !== null && rejectedByServer(live));
	let phase = $derived<DuckPhase>(
		live?.status === 'streaming' ? (live.text ? 'speak' : 'think') : listening ? 'listen' : 'rest'
	);
	let duckPose = $derived<DuckPose>(reaction ?? poseForPhase(phase));
	/** What the duck says stands here as text (DESIGN.md §9.3i); special states get one fixed line. */
	let line = $derived.by(() => {
		if (live?.status === 'streaming' && live.text) return live.text;
		if (live && live.status !== 'streaming') {
			return live.status === 'aborted'
				? 'Abgebrochen.'
				: (live.problem?.message ?? 'Gerade keine Antwort – probier’s nochmal.');
		}
		if (!lastReply) return scenario.title;
		if (lastReply.kind === 'wait') return WAIT_LINE;
		if (lastReply.boundary) return BOUNDARY_LINE;
		if (lastReply.move === 'abschliessen') return CLOSING_LINE;
		return lastReply.text;
	});
	// A new backend cannot continue a session it never saw: start over when the client changes.
	$effect(() => {
		const client = tutorApp.client;
		untrack(() => {
			if (boundClient && boundClient !== client) {
				newSession(started ? 'Neue Verbindung, neue Runde.' : undefined);
			}
			boundClient = client;
		});
	});

	$effect(() => () => controller?.abort());

	// Keep the session for this scenario. A stream still running is stopped on leaving, so it is
	// kept as aborted: retry sends the same request ID and the server returns a stored turn again.
	$effect(() => {
		const current = $state.snapshot(live);
		const snapshot: SavedSession = {
			sessionId,
			revision,
			sessionState,
			cursor,
			entries: $state.snapshot(entries),
			live: current?.status === 'streaming' ? { ...current, status: 'aborted' } : current,
			draft,
			confidence,
			mode,
			boundClient: untrack(() => boundClient ?? tutorApp.client)
		};
		untrack(() => saveSession(scenario.id, snapshot));
	});

	// Leaving the scenario stops its stream; the turn stays open as aborted for a later check.
	$effect(() => {
		if (!active) untrack(() => controller?.abort());
	});

	function newSession(note?: string) {
		controller?.abort();
		clearSession(scenario.id);
		artifact = null;
		sessionId = crypto.randomUUID();
		revision = 0;
		sessionState = null;
		cursor = startCursor(scenario);
		live = null;
		entries = note ? [{ kind: 'note', id: crypto.randomUUID(), text: note }] : [];
		announcement = '';
		reaction = null;
	}

	function learnerText(input: TutorInput): string {
		if (input.kind === 'explain') return EXAMPLE_REQUEST;
		return input.text ?? '';
	}

	function send(input: TutorInput, via: LearnerVia) {
		if (busy) return;

		reaction = null;
		const request: TutorTurnRequest = {
			...tutorScope(scenario),
			sessionId,
			expectedRevision: revision,
			requestId: crypto.randomUUID(),
			input,
			...(tutorApp.config.mode === 'mock' || tutorApp.shareWithApi
				? { agentContext: learningMemory.snapshot(screen.getSnapshot()) }
				: {})
		};
		const learner: LearnerEntry = {
			kind: 'learner',
			id: `${request.requestId}:local`,
			text: learnerText(input),
			via,
			confidence: input.kind === 'answer' ? input.confidence : undefined,
			sketch: input.kind === 'whiteboard' ? input.snapshot : undefined
		};
		void runTurn(request, learner);
	}

	function isCurrent(request: TutorTurnRequest): boolean {
		return live?.request.requestId === request.requestId;
	}

	function fail(request: TutorTurnRequest, problem: ApiProblem) {
		if (!live || !isCurrent(request)) return;
		live.status = 'failed';
		live.problem = problem;
		announcement = `Keine Antwort: ${problem.message}`;
	}

	async function runTurn(request: TutorTurnRequest, learner: LearnerEntry) {
		const turnController = new AbortController();
		controller = turnController;
		artifact = null;
		panel = null;
		expanded = true;
		live = { request, learner, text: '', status: 'streaming' };
		announcement = '';
		// Late events from an aborted stream or a hidden tab must not touch the session.
		const stale = () => turnController.signal.aborted || !active || !isCurrent(request);
		const markAborted = () => {
			if (live && isCurrent(request) && live.status === 'streaming') live.status = 'aborted';
		};
		try {
			for await (const event of tutorApp.client.streamTurn(request, turnController.signal)) {
				if (stale()) {
					markAborted();
					return;
				}
				if (event.type === 'delta') {
					live.text += event.text;
				} else if (event.type === 'error') {
					fail(request, event.problem);
					return;
				} else {
					if (stale()) {
						markAborted();
						return;
					}
					confirm(request, learner, event.response);
					return;
				}
			}
			if (stale()) {
				markAborted();
				return;
			}
			fail(request, {
				code: 'protocol',
				message: 'Antwort unvollständig.',
				retryable: true
			});
		} catch (error) {
			if (stale()) {
				markAborted();
				return;
			}
			fail(
				request,
				error instanceof ApiError
					? error.problem
					: { code: 'network', message: 'Gerade nicht erreichbar.', retryable: true }
			);
		} finally {
			if (controller === turnController) controller = null;
		}
	}

	function confirm(request: TutorTurnRequest, learner: LearnerEntry, response: TutorTurnResponse) {
		if (
			!acceptsTurn(
				request,
				response,
				live?.request.requestId,
				revision,
				controller?.signal.aborted ?? true
			)
		) {
			fail(request, {
				code: 'protocol',
				message: 'Antwort passte nicht zur Anfrage.',
				retryable: false
			});
			return;
		}
		const next = advance(scenario, cursor, request.input);
		const confirmed: LearnerEntry = response.learnerMessage
			? { ...learner, id: response.learnerMessage.id, text: response.learnerMessage.text }
			: learner;
		const reply: TranscriptEntry =
			response.outcome === 'wait'
				? { kind: 'wait', id: `${request.requestId}:wait` }
				: {
						kind: 'tutor',
						id: response.message.id,
						text: response.message.text,
						move: response.message.move,
						media: response.message.media,
						boundary: learner.via === 'solution' || !!next.diagnosisId?.startsWith('delegation')
					};
		entries.push(confirmed, reply);
		artifact = response.artifact ?? null;
		revision = response.session.revision;
		sessionState = response.session.state;
		cursor = next.cursor;
		live = null;
		clearSentSketch(request.input);
		announcement = reply.kind === 'tutor' ? `Tutor: ${reply.text}` : WAIT_LINE;
		// One short reaction, then the duck stands still while the learner thinks (§9.2g).
		const pose = reply.kind === 'tutor' ? reactionFor(reply) : 'wait';
		reaction = pose === 'wait' ? null : pose;
	}

	function clearSentSketch(input: TutorInput) {
		const pending = tutorApp.getPendingWhiteboard(scenario.id);
		if (input.kind !== 'whiteboard' || !pending) return;
		if (
			pending.boardId === input.snapshot.boardId &&
			pending.revision === input.snapshot.revision
		) {
			tutorApp.setPendingWhiteboard(scenario.id, null);
		}
	}

	function retry() {
		if (!live || live.status === 'streaming' || needsRestart || !active) return;
		// Same request ID: if the server already stored the turn, it returns that turn again.
		// Snapshots, because the client structured-clones the request and proxies cannot be cloned.
		void runTurn($state.snapshot(live.request), $state.snapshot(live.learner));
	}

	/** Only for turns the server clearly refused; anything uncertain needs retry or a new session. */
	function discard() {
		if (!live || !rejectedByServer(live)) return;
		if (live.learner.via === 'free') draft = live.learner.text;
		live = null;
	}

	/** Leaves an uncertain turn behind safely: a fresh session starts at revision 0. */
	function restart() {
		const text = live?.learner.via === 'free' ? live.learner.text : undefined;
		newSession('Neue Runde gestartet.');
		if (!draft.trim() && text !== undefined) draft = text;
	}

	function abort() {
		controller?.abort();
	}

	function sendDraft(event?: SubmitEvent) {
		event?.preventDefault();
		const text = draft.trim();
		if (!text || busy) return;
		send(draftInput(text, mode, confidence), 'free');
		draft = '';
		confidence = undefined;
		mode = 'message';
	}

	/** The explicit hand-in switch; back to a question drops any confidence with it. */
	function toggleAnswer() {
		mode = mode === 'answer' ? 'message' : 'answer';
		if (mode === 'message') confidence = undefined;
		field?.focus();
	}

	function sendSketch() {
		if (!sketch) return;
		const text = draft.trim();
		send(
			text
				? { kind: 'whiteboard', snapshot: sketch, text }
				: { kind: 'whiteboard', snapshot: sketch },
			'sketch'
		);
		draft = '';
	}

	/** The one primary key: send, or what the open turn needs (abort, check again, drop). */
	function primary() {
		if (live?.status === 'streaming') abort();
		else if (live && needsRestart) restart();
		else if (live && rejected) discard();
		else if (live) retry();
	}
</script>

<svelte:window onkeydown={escape} />
{#snippet tutorControls()}
	<div class="tutor-drawer" role="group" aria-label="Thema">
		<div class="choices">
			{#each tutorScenarios as item (item.id)}<a
					href="{resolve('/tutor')}?szenario={encodeURIComponent(item.id)}"
					aria-current={item.id === scenario.id ? 'true' : undefined}
				>
					{#if item.id === scenario.id}<Icon name="check" />{/if}{item.shortLabel}
				</a>{/each}
			<a href="{resolve('/whiteboard')}?scenario={encodeURIComponent(scenario.id)}">Whiteboard</a>
			{#if started}<button
					type="button"
					onclick={() => {
						expanded = true;
						panel = 'history';
						drawer.close();
					}}
				>
					Verlauf
				</button>{/if}
		</div>
	</div>
{/snippet}
<article class="tutor-viewport" data-surface="paper" aria-label={scenario.title}>
	<button
		class="duck-button"
		bind:this={duck}
		aria-label="Mit der Ente sprechen"
		aria-describedby="tutor-duck-help"
		aria-expanded={expanded}
		onpointerdown={pressDuck}
		onpointermove={moveDuck}
		onpointerup={(e) => releaseDuck(e)}
		onpointercancel={(e) => releaseDuck(e, true)}
		onkeydown={(e) => {
			if (e.key.toLowerCase() !== 'h' || e.metaKey || e.ctrlKey || e.altKey) return;
			e.preventDefault();
			hipster();
		}}
		onclick={tapDuck}
	>
		<span class="duck-body" style:translate={drop ? `0 ${drop}px` : undefined}>
			<DuckStage
				variant="fullscreen"
				pose={duckPose}
				cue={reactionCue}
				idle={idleAllowed(
					started,
					!live && lastReply?.kind === 'tutor' && lastReply.move === 'abschliessen'
				)}
				interactive
				wardrobe={duckWardrobe.current}
				{speechLevel}
				onposedone={() => (reaction = null)}
			/>
		</span>
	</button>
	<span id="tutor-duck-help" class="visually-hidden">
		Antippen öffnet die Eingabe. Nach unten ziehen führt zurück.
	</span>
	{#if quip}<div class="quip"><DuckChip text={quip} /></div>{/if}
	{#if expanded}
		<div class="dock" oninput={interaction}>
			{#if artifact}
				<ArtifactOverlay
					{artifact}
					onclose={close}
					onanswer={(text) => {
						send({ kind: 'answer', text }, 'reply');
						void open();
					}}
				/>
			{:else if panel === 'history'}
				<div class="history">
					<Transcript
						{entries}
						{live}
						onabort={abort}
						onretry={needsRestart ? undefined : retry}
						ondiscard={discard}
						onrestart={restart}
					/>
				</div>
			{:else if started}<div class="response">
					<p><RichText text={line} /></p>
					{#if lastReply?.kind === 'tutor' && !live}{#key lastReply.id}<TutorSpeech
								text={line}
								onlevel={(v) => (speechLevel = v)}
							/>{/key}{/if}
				</div>{/if}
			<form onsubmit={sendDraft}>
				<BottomBar reserveDuck={false} fixed={false} class="input-bar">
					{#if sketch}<IconButton
							icon="pen"
							label="Skizze senden"
							disabled={busy}
							onclick={sendSketch}
						/>{/if}
					{#if started}<IconButton
							icon="check"
							label={mode === 'answer' ? 'Als Frage senden' : 'Als Antwort abgeben'}
							active={mode === 'answer'}
							class="mode"
							onclick={toggleAnswer}
						/>{/if}
					<input
						bind:this={field}
						name="draft"
						aria-label={mode === 'answer' ? 'Deine Antwort' : 'Deine Nachricht'}
						placeholder={mode === 'answer' ? 'Deine Antwort …' : 'Was gibt’s?'}
						autocomplete="off"
						enterkeyhint="send"
						bind:value={draft}
					/>
					<Dictation
						ontext={(value) => {
							draft = [draft, value].filter(Boolean).join(' ');
							field?.focus();
						}}
					/>
					{#if live}<button type="button" class="state" onclick={primary}>
							{live.status === 'streaming'
								? 'Abbrechen'
								: needsRestart
									? 'Neu starten'
									: rejected
										? 'Verwerfen'
										: 'Nochmal'}
						</button>
					{:else}<IconButton
							icon="arrow-up"
							label={mode === 'answer' ? 'Antwort abgeben' : 'Senden'}
							class="send"
							disabled={!draft.trim() || tutorApp.switching}
							onclick={() => sendDraft()}
						/>{/if}
				</BottomBar>
			</form>
		</div>{/if}
	<p class="visually-hidden" aria-live="polite">{announcement}</p>
</article>

<style>
	.tutor-viewport {
		position: relative;
		width: 100%;
		height: 100dvh;
		overflow: hidden;
		color: var(--text);
		background: var(--surface);
		font: 400 17px/26px var(--font-sans);
	}
	.duck-button {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100dvh;
		max-inline-size: none;
		padding: 0;
		border: 0;
		background: transparent;
		cursor: grab;
		touch-action: none;
		-webkit-tap-highlight-color: transparent;
	}
	.duck-button:active {
		cursor: grabbing;
	}
	/* No ring on the duck: a tap shows nothing, and the keyboard focus is one short line below
	   the figure, never across face, glasses or wings. */
	.duck-button:focus,
	.duck-button:focus-visible {
		outline: none;
	}
	.duck-button:focus-visible::after {
		content: '';
		position: absolute;
		inset-block-end: calc(var(--duck-bottom) + var(--space-m));
		inset-inline-start: 50%;
		inline-size: min(8rem, 30vw);
		block-size: var(--focus-width);
		translate: -50% 0;
		border-radius: var(--radius-pill);
		background: var(--focus);
		pointer-events: none;
	}
	.duck-body {
		display: block;
		height: 100%;
	}
	.quip {
		position: absolute;
		top: calc(var(--shell-edge) + var(--hit) + var(--space-m));
		left: 50%;
		translate: -50% 0;
		pointer-events: none;
	}
	/* One column above the bottom edge: answer, then the single 64 px input bar. */
	.dock {
		position: absolute;
		bottom: var(--duck-bottom);
		left: 50%;
		transform: translateX(-50%);
		width: min(36rem, calc(100% - 2 * var(--space-m)));
		display: flex;
		flex-direction: column;
		gap: var(--space-s);
		max-height: calc(100% - var(--duck-bottom) - var(--bar));
		overflow: auto;
	}
	.response,
	.history {
		background: var(--popup-duck-bg);
		color: var(--popup-text);
		backdrop-filter: blur(14px);
		border-radius: var(--radius-option);
		padding: var(--space-s) var(--space-m);
		overflow: auto;
	}
	.response p {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.dock .state {
		flex: none;
		border: 0;
		border-radius: var(--radius-pill);
		min-height: var(--hit);
		padding: 0 var(--space-m);
		background: var(--card);
		color: var(--text);
		font: inherit;
		cursor: pointer;
	}
	/* The shared 64 px BottomBar as one pill: same bar and button language as every page. */
	.dock form {
		flex: none;
	}
	.dock :global(.input-bar) {
		gap: var(--step-1);
		padding-inline: var(--step-2);
		box-sizing: border-box;
		background: var(--popup-bg);
		backdrop-filter: blur(18px);
		border-radius: var(--radius-pill);
	}
	/* The whole pill takes the focus ring, never a square box inside it. */
	.dock form:has(input:focus-visible) :global(.input-bar) {
		outline: var(--focus-width) solid var(--focus);
		outline-offset: 2px;
	}
	.dock input {
		flex: 1;
		min-width: 0;
		align-self: stretch;
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		padding-inline: var(--space-s);
	}
	.dock input:focus-visible {
		outline: none;
	}
	.dock :global(.send) {
		background: var(--action);
		color: var(--action-text);
	}
	/* Locked: sunk and muted, never a faded key. */
	.dock :global(.send:disabled) {
		background: var(--well);
		color: var(--text-muted);
		opacity: 1;
		cursor: not-allowed;
	}
	.dock :global(.mode[aria-pressed='true']) {
		background: var(--duck-accent);
		color: var(--palette-ink);
		box-shadow: none;
	}

	/* Drawer section (rendered in the top edge drawer). */
	.tutor-drawer {
		display: block;
	}
	.choices {
		display: flex;
		flex-wrap: nowrap;
		overflow-x: auto;
		scrollbar-width: none;
		gap: var(--space-s);
	}
	.choices a,
	.choices button {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: var(--space-s);
		min-height: var(--hit);
		padding-inline: var(--space-m);
		border: 0;
		border-radius: var(--radius-pill);
		background: var(--card);
		color: var(--text);
		font: inherit;
		text-decoration: none;
		cursor: pointer;
	}
	.choices [aria-current='true'] {
		background: var(--mark);
		color: var(--mark-text);
	}
</style>
