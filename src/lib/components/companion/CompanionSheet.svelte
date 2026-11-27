<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { getTutorAppContext } from '$lib/api/context.svelte';
	import { buildContextualHelp } from '$lib/memory';
	import { latestSavedNote } from '$lib/memory/snapshot';
	import { learningMemory, screenContext } from '$lib/memory/runtime.svelte';
	import { Icon } from '$lib/modules';
	import DuckStage from '../duck/DuckStage.svelte';
	import Dictation from '../tutor/Dictation.svelte';
	import MemoryDrawer from './MemoryDrawer.svelte';
	import { makeRequest, contextLine } from './companion-logic';

	let {
		share,
		onshare,
		onclose
	}: {
		share: boolean;
		onshare: (value: boolean) => void;
		onclose: () => void;
	} = $props();
	const app = getTutorAppContext();
	let snapshot = $derived(screenContext.snapshot());
	let dialog: HTMLDialogElement;
	let panel = $state<'chat' | 'memory'>('chat');
	let mode = $state<'question' | 'note'>('question');
	let input = $state('');
	let status = $state('');
	let messages = $state<{ role: string; text: string }[]>([]);
	let session = crypto.randomUUID();
	let revision = 0;
	let controller = $state.raw<AbortController>();
	let tail = $state<HTMLElement>();
	onMount(() => {
		dialog.showModal();
		function escape(event: KeyboardEvent) {
			if (event.key !== 'Escape') return;
			event.stopPropagation();
			event.preventDefault();
			dialog.close();
		}
		dialog.addEventListener('keydown', escape);
		return () => dialog.removeEventListener('keydown', escape);
	});
	onDestroy(() => controller?.abort());
	function changePanel() {
		panel = panel === 'chat' ? 'memory' : 'chat';
		learningMemory.refresh();
		snapshot = screenContext.snapshot();
	}
	function clear() {
		controller?.abort();
		controller = undefined;
		learningMemory.clearAll();
		onshare(false);
		messages = [];
		status = '';
		input = '';
		revision = 0;
		session = crypto.randomUUID();
		snapshot = screenContext.snapshot();
	}
	async function send() {
		const text = input.trim();
		if (!text || controller || screenContext.current.isIndependentProbe) return;
		const before = screenContext.snapshot();
		learningMemory.addNote(mode, text);
		input = '';
		if (mode === 'note') {
			status = 'Gedankennotiz gespeichert.';
			return;
		}
		status = '';
		messages.push({ role: 'Du', text });
		const request = makeRequest(before, text, session, revision);
		if (!request) {
			const note = latestSavedNote(before);
			let answer = buildContextualHelp(before);
			if (/notiz|gemerkt|erinner|gespeichert/i.test(text)) {
				answer = note
					? `Du hast festgehalten: „${note.text}“. Wie würdest du den Gedanken heute ergänzen?`
					: 'Zu diesem Inhalt hattest du bisher nichts gespeichert.';
			} else if (/lesezeit|wie lange/i.test(text)) {
				answer = contextLine(before);
			} else if (!before.visibleScreen.termId && !before.visibleScreen.formulaId) {
				answer = `Für „${text}“ gibt es hier keine eigene redaktionelle Antwort. ${answer}`;
			}
			messages.push({ role: 'Redaktionelle Hilfe', text: answer });
		} else {
			const turn = new AbortController();
			controller = turn;
			try {
				const reply = await app.client.turn(request, turn.signal);
				if (turn.signal.aborted) return;
				revision = reply.session.revision;
				messages.push({
					role: 'Tutor-Ente',
					text: reply.message?.text ?? 'Ich warte auf deinen nächsten Schritt.'
				});
			} catch (error) {
				if (!turn.signal.aborted)
					status =
						error instanceof Error ? error.message : 'Die Antwort konnte nicht geladen werden.';
			} finally {
				if (controller === turn) controller = undefined;
			}
		}
		await tick();
		tail?.scrollIntoView({ block: 'nearest' });
	}
</script>

<dialog bind:this={dialog} aria-labelledby="companion-title" {onclose}>
	<header>
		<h2 id="companion-title">Tutor-Ente</h2>
		<button class="close" aria-label="Tutor-Ente schließen" onclick={() => dialog.close()}>
			<Icon name="close" />
		</button>
	</header>
	<div class="line">Sieht: {contextLine(snapshot)}</div>
	{#if !snapshot.visibleScreen.isIndependentProbe}
		<button class="view" onclick={changePanel}>
			{panel === 'chat' ? 'Mein Gedächtnis' : 'Zum Gespräch'}
		</button>
	{/if}
	{#if panel === 'memory'}<MemoryDrawer {share} {onshare} onclear={clear} />
	{:else}
		<div class="introduction">
			<div class="duck" aria-hidden="true">
				<DuckStage variant="companion" interactive={false} />
			</div>
			<p>{buildContextualHelp(snapshot)}</p>
		</div>
		{#if !snapshot.visibleScreen.isIndependentProbe}
			<div class="log" role="log">
				{#each messages as message}<p><strong>{message.role}</strong>{message.text}</p>{/each}<span
					bind:this={tail}
				></span>
			</div>
			<form
				onsubmit={(event) => {
					event.preventDefault();
					void send();
				}}
			>
				<div class="modes">
					{#each ['question', 'note'] as id}<button
							type="button"
							aria-pressed={mode === id}
							onclick={() => {
								mode = id === 'note' ? 'note' : 'question';
								status = '';
							}}
						>
							{id === 'note' ? 'Gedankennotiz merken' : 'Fragen'}
						</button>{/each}
				</div>
				<textarea
					name="companion-entry"
					autocomplete="off"
					aria-label={mode === 'note' ? 'Gedankennotiz' : 'Deine Frage'}
					placeholder={mode === 'note' ? 'Was möchtest du festhalten?' : 'Was möchtest du wissen?'}
					bind:value={input}
					rows="2"></textarea>
				<div class="actions">
					<Dictation
						ontext={(value) => (input = [input, value].filter(Boolean).join(' '))}
					/><button
						class="primary"
						disabled={!input.trim() || !!controller || app.switching}
						type="submit"
					>
						{controller
							? 'Antwort ausstehend…'
							: mode === 'note'
								? 'Notiz speichern'
								: 'Frage stellen'}
					</button>
				</div>
			</form>
			<p role="status">{status}</p>
		{/if}
	{/if}
</dialog>

<style>
	dialog {
		position: fixed;
		inset: auto max(var(--space-m), env(safe-area-inset-right))
			max(var(--space-m), env(safe-area-inset-bottom)) auto;
		margin: 0;
		width: min(28rem, calc(100vw - 2 * var(--space-m)));
		max-height: calc(100dvh - 2 * var(--space-m));
		overflow: auto;
		overscroll-behavior: contain;
		border: var(--edge-width) solid var(--hairline);
		background: var(--card);
		color: var(--text);
		padding: var(--gutter);
		overflow-wrap: anywhere;
	}
	header,
	.actions,
	.modes {
		display: flex;
		align-items: center;
		gap: var(--space-s);
	}
	header {
		justify-content: space-between;
	}
	h2 {
		font-size: var(--type-question);
	}
	button {
		cursor: pointer;
		border: 0;
		background: var(--well);
		color: var(--text);
		border-radius: var(--radius-pill);
		min-height: var(--hit);
		padding-inline: var(--space-m);
	}
	.close {
		width: var(--hit);
		padding: 0;
		border-radius: 50%;
		display: grid;
		place-items: center;
	}
	.line {
		font-size: var(--type-meta);
		color: var(--text-muted);
	}
	.view {
		margin-block: var(--space-s);
	}
	.introduction {
		display: flex;
		align-items: flex-start;
		gap: var(--space-s);
		margin-block: var(--space-m);
	}
	.duck {
		flex: 0 0 var(--control);
		height: var(--control);
		overflow: hidden;
	}
	.duck :global(.duck-stage),
	.duck :global(.air) {
		height: 100%;
		width: 100%;
	}
	.log strong {
		display: block;
		font-size: var(--type-meta);
	}
	.log p {
		margin-block-end: var(--space-m);
	}
	form {
		display: grid;
		gap: var(--space-s);
	}
	.modes {
		flex-wrap: wrap;
	}
	[aria-pressed='true'],
	.primary {
		background: var(--action);
		color: var(--action-text);
	}
	textarea {
		width: 100%;
		background: var(--well);
		color: var(--text);
		font: inherit;
		padding: var(--space-m);
		border: var(--hairline-width) solid var(--hairline);
		border-radius: var(--radius-option);
		resize: none;
	}
	.actions {
		justify-content: flex-end;
	}
	/* Locked: sunk and muted like a stage's "Festlegen", never a faded key. */
	button:disabled {
		background: var(--well);
		color: var(--text-muted);
		cursor: not-allowed;
	}
</style>
