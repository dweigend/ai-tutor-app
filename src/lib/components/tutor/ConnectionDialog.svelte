<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { getTutorAppContext } from '$lib/api/context.svelte';
	import { ApiError, HttpTutorClient } from '$lib/api';
	import type { ApiMode } from '$lib/api/types';

	let {
		shareWithApi = false,
		onconsent
	}: { shareWithApi?: boolean; onconsent?: (enabled: boolean) => void } = $props();
	let consent = $state(false);
	const tutorApp = getTutorAppContext();

	type HealthState =
		| { kind: 'idle' }
		| { kind: 'testing' }
		| { kind: 'ok'; url: string }
		| { kind: 'failed'; message: string };

	let open = $state(false);
	let mode = $state<ApiMode>('mock');
	let baseUrl = $state('');
	let health = $state<HealthState>({ kind: 'idle' });
	let controller: AbortController | null = null;

	let live = $derived(tutorApp.config.mode === 'http');
	let statusLabel = $derived(
		tutorApp.switching ? 'Verbindung …' : live ? 'Live-API' : 'Demo-Modus'
	);

	function onOpenChange(next: boolean) {
		if (!next) {
			controller?.abort();
			return;
		}
		consent = shareWithApi;
		mode = tutorApp.config.mode;
		baseUrl = tutorApp.config.mode === 'http' ? tutorApp.config.baseUrl : '';
		health = { kind: 'idle' };
	}

	function describe(error: unknown): string {
		if (error instanceof ApiError) return error.problem.message;
		return 'Die API hat nicht wie erwartet geantwortet.';
	}

	async function testConnection() {
		controller?.abort();
		controller = new AbortController();
		const signal = controller.signal;
		health = { kind: 'testing' };
		try {
			// A throwaway client tests the URL before the app switches to it.
			const client = new HttpTutorClient(baseUrl.trim() || '/');
			await client.health(signal);
			if (!signal.aborted) health = { kind: 'ok', url: baseUrl.trim() || '/' };
		} catch (error) {
			if (!signal.aborted) health = { kind: 'failed', message: describe(error) };
		}
	}

	function apply() {
		tutorApp.switchMode(mode, mode === 'http' ? baseUrl : undefined);
		if (!tutorApp.configError) {
			onconsent?.(mode === 'http' && consent);
			open = false;
		}
	}
</script>

<Dialog.Root bind:open {onOpenChange}>
	<Dialog.Trigger
		class="connection-trigger"
		aria-label="Verbindung: {statusLabel}. Einstellungen öffnen"
	>
		<span class="connection-dot" class:live aria-hidden="true"></span>
		<span class="data">{statusLabel}</span>
	</Dialog.Trigger>
	<Dialog.Portal>
		<Dialog.Overlay class="dialog-overlay" />
		<Dialog.Content class="dialog-content connection-dialog" data-surface="white">
			<Dialog.Title>Verbindung</Dialog.Title>
			<Dialog.Description class="muted">
				Im Demo-Modus antwortet ein festes Kursskript im Browser. Die Live-API spricht mit einem
				Tutor-Server unter <span class="data">/api/v1</span>. Ein Wechsel beginnt neue Sitzungen.
			</Dialog.Description>

			<fieldset class="modes">
				<legend class="label">Modus</legend>
				<label class="mode">
					<input type="radio" name="api-mode" value="mock" bind:group={mode} />
					<span>Demo-Modus</span>
				</label>
				<label class="mode">
					<input type="radio" name="api-mode" value="http" bind:group={mode} />
					<span>Live-API</span>
				</label>
			</fieldset>

			{#if mode === 'http'}
				<label>
					<input type="checkbox" bind:checked={consent} /> Lernverlauf und Notizen mit dieser API teilen
				</label>
				<label class="url">
					<span class="label">Basis-URL</span>
					<input
						type="url"
						bind:value={baseUrl}
						oninput={() => {
							health = { kind: 'idle' };
							consent = false;
						}}
						placeholder="https://tutor.example.org"
						autocomplete="url"
						spellcheck="false"
					/>
					<span class="data muted">Leer lassen für dieselbe Adresse wie diese Seite.</span>
				</label>
				<div class="test">
					<button
						type="button"
						class="button button-quiet"
						disabled={health.kind === 'testing'}
						onclick={testConnection}
					>
						{health.kind === 'testing' ? 'Wird geprüft …' : 'Verbindung testen'}
					</button>
					<p class="health" aria-live="polite">
						{#if health.kind === 'ok'}
							<span class="tag tag-ok label">Erreichbar</span> API v1 antwortet.
						{:else if health.kind === 'failed'}
							<span class="tag tag-fail label">Nicht erreichbar</span> {health.message}
						{/if}
					</p>
				</div>
			{/if}

			{#if tutorApp.configError}
				<p class="problem" role="alert">{tutorApp.configError}</p>
			{/if}

			<div class="actions">
				<Dialog.Close class="button button-quiet">Abbrechen</Dialog.Close>
				<button type="button" class="button" onclick={apply}>Übernehmen</button>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.connection-trigger) {
		display: inline-flex;
		align-items: center;
		gap: var(--step-2);
		min-block-size: 2.75rem;
		padding: 0 var(--step-3);
		border: 0;
		border-radius: var(--radius-pill);
		background: var(--card);
		color: var(--text);
		font-family: var(--font-mono);
		font-size: var(--type-label);
		cursor: pointer;
	}

	/* A square, not a dot (DESIGN.md §3.1): open in the line colour, filled when live. */
	.connection-dot {
		inline-size: 0.5rem;
		block-size: 0.5rem;
		border: var(--hairline-width) solid currentColor;
		background: transparent;
	}

	.connection-dot.live {
		background: var(--palette-signal-orange);
	}

	:global(.connection-dialog) {
		gap: var(--step-5);
	}

	.modes {
		display: grid;
		margin: 0;
		padding: 0;
		border: 0;
	}

	.modes legend {
		margin-block-end: var(--step-2);
		padding: 0;
	}

	.mode {
		display: flex;
		align-items: center;
		gap: var(--step-3);
		min-block-size: 2.75rem;
		padding-inline: var(--step-3);
		border: var(--hairline-width) solid var(--hairline);
		cursor: pointer;
	}

	.mode + .mode {
		border-block-start: 0;
	}

	.mode:has(input:checked) {
		background: var(--palette-signal-yellow);
	}

	.mode input {
		accent-color: var(--palette-ink);
	}

	.url {
		display: grid;
		gap: var(--step-2);
	}

	.url input {
		min-block-size: 2.75rem;
		padding: 0 var(--step-3);
		border: var(--hairline-width) solid var(--hairline);
		border-radius: var(--radius-flat);
		background: var(--palette-white);
		font-family: var(--font-mono);
		font-size: var(--type-label);
	}

	.test {
		display: grid;
		justify-items: start;
		gap: var(--step-2);
	}

	.health:empty {
		display: none;
	}

	.tag {
		margin-inline-end: var(--step-2);
		padding: 0.15rem var(--step-2);
	}

	.tag-ok {
		background: var(--palette-ink);
		color: var(--palette-white);
	}

	.tag-fail {
		background: var(--palette-signal-crimson);
		color: var(--palette-white);
	}

	.problem {
		padding: var(--step-3);
		border-inline-start: var(--edge-width) solid var(--palette-signal-crimson);
		background: var(--surface);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--step-2);
	}
</style>
