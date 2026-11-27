<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { resolve } from '$app/paths';
	import { getTutorAppContext } from '$lib/api/context.svelte';
	import { buildContextualHelp, INDEPENDENT_PROBE_HELP } from '$lib/memory';
	import { latestSavedNote } from '$lib/memory/snapshot';
	import { learningMemory, screenContext } from '$lib/memory/runtime.svelte';
	import { BottomBar, IconButton } from '$lib/modules';
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
	let field = $state<HTMLInputElement>();
	onMount(() => {
		dialog.show();
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
			mode = 'question';
			status = 'Gemerkt.';
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
					? `Du hattest dir notiert: „${note.text}“. Was denkst du jetzt darüber?`
					: 'Hier hast du dir noch nichts notiert.';
			} else if (/lesezeit|wie lange/i.test(text)) {
				answer = contextLine(before);
			}
			messages.push({ role: 'Tutor', text: answer });
		} else {
			const turn = new AbortController();
			controller = turn;
			try {
				const reply = await app.client.turn(request, turn.signal);
				if (turn.signal.aborted) return;
				revision = reply.session.revision;
				messages.push({
					role: 'Tutor',
					text: reply.message?.text ?? 'Alles klar – was ist dein nächster Schritt?'
				});
			} catch (error) {
				if (!turn.signal.aborted)
					status =
						error instanceof Error ? error.message : 'Gerade keine Antwort – probier’s nochmal.';
			} finally {
				if (controller === turn) controller = undefined;
			}
		}
		await tick();
		tail?.scrollIntoView({ block: 'nearest' });
	}
</script>

<dialog bind:this={dialog} aria-label="Tutor" {onclose}>
	<!-- Icons only: chat or memory, the fullscreen tutor (the keyboard way; the pointer pulls the
	     corner duck up) and close. -->
	<header>
		{#if !snapshot.visibleScreen.isIndependentProbe}<IconButton
				icon="book"
				label={panel === 'chat' ? 'Notizen und Verlauf' : 'Zurück zum Chat'}
				active={panel === 'memory'}
				onclick={changePanel}
			/>{/if}
		<IconButton icon="external" label="Tutor im Vollbild" href={resolve('/tutor')} />
		<IconButton icon="close" label="Schließen" onclick={() => dialog.close()} />
	</header>
	<div class="scroll">
		{#if panel === 'memory'}<MemoryDrawer {share} {onshare} onclear={clear} />
		{:else}
			{#if snapshot.visibleScreen.isIndependentProbe}
				<p class="introduction">{INDEPENDENT_PROBE_HELP}</p>
			{:else if !messages.length}
				<p class="introduction">
					{snapshot.visibleScreen.termLabel
						? `Frage zu ${snapshot.visibleScreen.termLabel}? Schieß los.`
						: 'Hey du – wo hakt’s gerade?'}
				</p>
			{/if}
			{#if !snapshot.visibleScreen.isIndependentProbe}
				<div class="log" role="log">
					{#each messages as message}<p>
							<strong>{message.role}</strong>{message.text}
						</p>{/each}<span bind:this={tail}></span>
				</div>
			{/if}
		{/if}
	</div>
	{#if panel === 'chat' && !snapshot.visibleScreen.isIndependentProbe}
		<form
			onsubmit={(event) => {
				event.preventDefault();
				void send();
			}}
		>
			<!-- The same one-line bar as on /tutor: input, microphone, send arrow. -->
			<BottomBar reserveDuck={false} fixed={false} class="entry-bar">
				<IconButton
					icon="bookmark"
					label={mode === 'note' ? 'Doch fragen' : 'Nur merken'}
					active={mode === 'note'}
					onclick={() => {
						mode = mode === 'note' ? 'question' : 'note';
						status = '';
						field?.focus();
					}}
				/>
				<input
					bind:this={field}
					name="companion-entry"
					autocomplete="off"
					enterkeyhint="send"
					aria-label={mode === 'note' ? 'Notiz' : 'Deine Frage'}
					placeholder={mode === 'note' ? 'Kurz festhalten …' : 'Was gibt’s?'}
					bind:value={input}
				/>
				<Dictation
					ontext={(value) => {
						input = [input, value].filter(Boolean).join(' ');
						field?.focus();
					}}
				/>
				<IconButton
					icon="arrow-up"
					label={mode === 'note' ? 'Merken' : 'Senden'}
					class="send"
					disabled={!input.trim() || !!controller || app.switching}
					onclick={() => void send()}
				/>
			</BottomBar>
		</form>
		<p role="status">{controller ? 'Moment …' : status}</p>
	{/if}
</dialog>

<style>
	dialog {
		position: fixed;
		/* Above the corner duck (DuckCompanion sets the clearance), never over it. */
		inset: auto var(--corner-inset) var(--companion-clearance, var(--duck-clearance)) auto;
		margin: 0;
		width: min(26rem, calc(100vw - 2 * var(--space-m)));
		max-height: calc(
			100dvh - var(--companion-clearance, var(--duck-clearance)) - var(--bar) - var(--space-s)
		);
		z-index: var(--z-popup);
		box-sizing: border-box;
		overflow: hidden;
		border: var(--hairline-width) solid var(--hairline);
		border-block-start: 3px solid var(--duck-accent);
		border-radius: var(--radius-option);
		background: var(--palette-paper);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		color: var(--popup-text);
		padding: var(--space-s);
		overflow-wrap: anywhere;
	}
	dialog[open] {
		display: flex;
		flex-direction: column;
		gap: var(--space-s);
	}
	header {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-s);
		flex: none;
	}
	/* The only scrolling part: header and entry bar always stay in view. */
	.scroll {
		flex: 1 1 auto;
		min-block-size: 0;
		overflow: auto;
		overscroll-behavior: contain;
		padding-inline: var(--space-s);
	}
	.introduction {
		margin-block: 0 var(--space-s);
	}
	.log strong {
		display: block;
		font-size: var(--type-meta);
	}
	.log p {
		margin-block-end: var(--space-m);
	}
	form {
		flex: none;
	}
	form :global(.entry-bar) {
		gap: var(--step-1);
		padding-inline: var(--step-2);
		box-sizing: border-box;
		background: var(--well);
		color: var(--text);
		border-radius: var(--radius-pill);
	}
	form:has(input:focus-visible) :global(.entry-bar) {
		outline: var(--focus-width) solid var(--focus);
		outline-offset: 2px;
	}
	input {
		flex: 1;
		min-inline-size: 0;
		align-self: stretch;
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		padding-inline: var(--space-s);
	}
	input:focus-visible {
		outline: none;
	}
	form :global(.m-icon-button[aria-pressed='true']) {
		background: var(--duck-accent);
		color: var(--palette-ink);
		box-shadow: none;
	}
	form :global(.send) {
		background: var(--action);
		color: var(--action-text);
	}
	/* Locked: sunk and muted, never a faded key. */
	form :global(.send:disabled) {
		background: var(--surface);
		color: var(--text-muted);
		opacity: 1;
		cursor: not-allowed;
	}
	[role='status'] {
		margin: 0;
		padding-inline: var(--space-s);
		font-size: var(--type-meta);
	}
	[role='status']:empty {
		display: none;
	}
</style>
