<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { goto } from '$app/navigation';
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
	import type { TutorScenario } from '$lib/content/types';
	import DuckStage from '$lib/components/duck/DuckStage.svelte';
	import {
		idleAllowed,
		poseForPhase,
		reactionFor,
		type DuckPhase
	} from '$lib/components/duck/triggers';
	import type { DuckPose } from '$lib/figures';
	import { Icon, RichText } from '$lib/modules';
	import {
		DEFAULT_WARDROBE,
		readWardrobe,
		saveWardrobe,
		toggleAccessory,
		type DuckAccessory
	} from '$lib/figures/duck-wardrobe';
	import { ScreenContextStore } from '$lib/memory';
	import ArtifactOverlay from './ArtifactOverlay.svelte';
	import TutorSpeech from './TutorSpeech.svelte';
	import Dictation from './Dictation.svelte';
	import type { TutorArtifact } from '$lib/api/types';

	import ConnectionDialog from './ConnectionDialog.svelte';
	import { advance, startCursor, type ScriptCursor } from './script';
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
	}

	let { scenario, active }: Props = $props();

	const tutorApp = getTutorAppContext();

	/* Fixed lines of the duck (textredaktion-v2.md §3). */
	const BOUNDARY_LINE = 'Das rechnest du. Was ist dein erster Schritt?';
	const WAIT_LINE = 'Ich warte.';
	const CLOSING_LINE = 'Für heute fertig.';

	const EXAMPLE_REQUEST = 'Kannst du mir das an einem anderen Beispiel zeigen?';

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
	let announcement = $state('');
	let reaction = $state<DuckPose | null>(null);
	let speechLevel = $state(0);
	let artifact = $state.raw<TutorArtifact | null>(null);
	let expanded = $state(false),
		panel = $state<'wardrobe' | 'history' | null>(null);
	let listening = $derived(expanded && draft.length > 0);
	let duck: HTMLButtonElement;
	let field = $state<HTMLInputElement>();
	let dragged = false,
		origin = [0, 0];
	let wardrobe = $state.raw({ ...DEFAULT_WARDROBE });
	const labels = {
		glasses: 'Brille',
		campusOutfit: 'Campus-Outfit',
		beanie: 'Mütze',
		clubMate: 'Club-Mate'
	};
	const accessories = Object.keys(labels) as DuckAccessory[];
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
	onMount(() => {
		wardrobe = readWardrobe();
	});
	$effect(() => {
		screen.setScreen({
			route: '/tutor',
			taskRef: scenario.task,
			courseId: scenario.task.courseId,
			topic: scenario.title
		});
	});
	function dress(key: DuckAccessory) {
		wardrobe = toggleAccessory(wardrobe, key);
		saveWardrobe(wardrobe);
	}
	async function open() {
		expanded = true;
		await tick();
		field?.focus();
	}
	function close() {
		artifact = null;
		expanded = false;
		panel = null;
		duck.focus();
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
				? 'Abgebrochen. Der Zug ist eventuell schon gespeichert.'
				: (live.problem?.message ?? 'Der Tutor hat nicht geantwortet.');
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
				newSession(started ? 'Verbindung gewechselt. Eine neue Sitzung beginnt.' : undefined);
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
			task: scenario.task,
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
				message: 'Der Stream endete ohne Abschluss.',
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
					: { code: 'network', message: 'Der Tutor ist gerade nicht erreichbar.', retryable: true }
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
				message: 'Die Antwort gehört zu einer anderen Anfrage.',
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
		newSession('Neu begonnen. Der offene Zug bleibt in der alten Sitzung.');
		if (!draft.trim() && text !== undefined) draft = text;
	}

	function abort() {
		controller?.abort();
	}

	function sendDraft(event?: SubmitEvent) {
		event?.preventDefault();
		const text = draft.trim();
		if (!text || busy) return;
		const input: TutorInput =
			confidence === undefined ? { kind: 'message', text } : { kind: 'answer', text, confidence };
		send(input, 'free');
		draft = '';
		confidence = undefined;
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
<article class="tutor-viewport" data-surface="paper" aria-label={scenario.title}>
	<button
		class="duck-button"
		bind:this={duck}
		aria-label="Mit der Ente sprechen"
		aria-expanded={expanded}
		onpointerdown={(e) => {
			origin = [e.clientX, e.clientY];
			dragged = false;
		}}
		onpointermove={(e) => {
			if (e.buttons && Math.hypot(e.clientX - origin[0], e.clientY - origin[1]) > 5) dragged = true;
		}}
		onclick={(e) => {
			if (e.detail && dragged) return;
			if (expanded) close();
			else void open();
		}}
	>
		<DuckStage
			variant="fullscreen"
			pose={duckPose}
			idle={idleAllowed(
				started,
				!live && lastReply?.kind === 'tutor' && lastReply.move === 'abschliessen'
			)}
			interactive
			{wardrobe}
			{speechLevel}
			onposedone={() => (reaction = null)}
		/>
	</button>
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
			{:else if panel === 'wardrobe'}
				<div class="drawer" role="group" aria-label="Garderobe">
					<label>
						Szenario
						<select
							value={scenario.id}
							onchange={(event) =>
								goto(
									resolve('/tutor') + '?szenario=' + encodeURIComponent(event.currentTarget.value)
								)}
						>
							{#each tutorScenarios as scenario (scenario.id)}
								<option value={scenario.id}>{scenario.shortLabel}</option>
							{/each}
						</select>
					</label>
					{#each accessories as key (key)}<button
							aria-pressed={wardrobe[key]}
							onclick={() => dress(key)}
						>
							{labels[key]}
						</button>{/each}
				</div>
			{:else if panel === 'history'}
				<div class="drawer history">
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
			{#if !artifact}
				<nav aria-label="Tutor bedienen">
					<a href={resolve('/')} aria-label="Zur Startseite" title="Startseite">
						<Icon name="home" />
					</a>
					<button
						aria-expanded={panel === 'wardrobe'}
						aria-label="Garderobe"
						title="Garderobe"
						onclick={() => (panel = panel === 'wardrobe' ? null : 'wardrobe')}
					>
						<Icon name="sliders" />
					</button>
					<a
						href="{resolve('/whiteboard')}?scenario={encodeURIComponent(scenario.id)}"
						aria-label="Whiteboard"
						title="Whiteboard"
					>
						<Icon name="pen" />
					</a>
					{#if started}<button
							aria-expanded={panel === 'history'}
							aria-label="Verlauf"
							title="Verlauf"
							onclick={() => (panel = panel === 'history' ? null : 'history')}
						>
							<Icon name="book" />
						</button>{/if}
					<ConnectionDialog
						shareWithApi={tutorApp.shareWithApi}
						onconsent={(enabled) => (tutorApp.shareWithApi = enabled)}
					/>
				</nav>
			{/if}
			{#if sketch}<button disabled={busy} onclick={sendSketch}>Skizze senden</button>{/if}
			<form onsubmit={sendDraft}>
				<input
					bind:this={field}
					name="draft"
					aria-label="Deine Nachricht"
					placeholder="Frag die Ente …"
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
				{#if live}<button type="button" onclick={primary}>
						{live.status === 'streaming'
							? 'Abbrechen'
							: needsRestart
								? 'Neue Sitzung beginnen'
								: rejected
									? 'Verwerfen'
									: 'Abgleichen'}
					</button>
				{:else}<button
						class="send"
						aria-label="Senden"
						disabled={!draft.trim() || tutorApp.switching}
					>
						<Icon name="arrow-up" />
					</button>{/if}
			</form>
		</div>{/if}
	<p class="visually-hidden" aria-live="polite">{announcement}</p>
</article>

<style>
	.tutor-viewport {
		position: relative;
		width: 100vw;
		height: 100dvh;
		overflow: hidden;
		color: var(--text);
		background: var(--surface);
		font: 400 17px/26px var(--font-sans);
	}
	.duck-button {
		position: absolute;
		inset: 0;
		width: 100vw;
		height: 100dvh;
		max-inline-size: none;
		padding: 0;
		border: 0;
		background: transparent;
		cursor: grab;
		touch-action: none;
	}
	.duck-button:active {
		cursor: grabbing;
	}
	.duck-button:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: -4px;
	}
	.dock {
		position: absolute;
		bottom: max(1rem, env(safe-area-inset-bottom));
		left: 50%;
		transform: translateX(-50%);
		width: min(36rem, calc(100% - 2rem));
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		max-height: calc(100% - 2rem);
		overflow: auto;
	}
	nav,
	.drawer,
	.response,
	form {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}
	nav {
		justify-content: center;
		flex-wrap: wrap;
	}
	nav a,
	.dock button {
		display: inline-grid;
		place-items: center;
		border: 0;
		border-radius: var(--radius-pill);
		min-height: 44px;
		min-width: 44px;
		padding: 0 0.75rem;
		background: var(--card);
		color: var(--text);
		font: inherit;
		cursor: pointer;
	}
	.drawer select {
		min-height: var(--hit);
		font: inherit;
		color: var(--text);
		background: var(--card);
		border: var(--hairline-width) solid var(--hairline);
		border-radius: var(--radius-option);
		margin-inline-start: var(--space-s);
	}
	.drawer,
	.response {
		background: var(--surface);
		border-radius: var(--radius-option);
		padding: 0.5rem;
		flex-wrap: wrap;
		overflow: auto;
	}
	.drawer {
		justify-content: center;
	}
	.drawer button[aria-pressed='true'],
	.dock .send {
		background: var(--action);
		color: var(--action-text);
	}
	.history {
		display: block;
	}
	.response {
		flex-wrap: nowrap;
	}
	.response p {
		margin: 0;
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.dock form {
		position: relative;
		flex: none;
		height: 56px;
		padding: 6px;
		box-sizing: border-box;
		background: var(--card);
		border-radius: var(--radius-pill);
	}
	.dock input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		padding-inline: 1rem;
	}
	.send:disabled {
		opacity: 0.55;
	}
</style>
