<script lang="ts">
	import { learningMemory } from '$lib/memory/runtime.svelte';
	let {
		share,
		onshare,
		onclear
	}: { share: boolean; onshare: (enabled: boolean) => void; onclear: () => void } = $props();
	let data = $derived(learningMemory.current);
</script>

<section aria-label="Mein Gedächtnis">
	<h3>Gesehen &amp; Lesezeit</h3>
	{#each data.recentHistory as entry (entry.id)}
		<div class="row">
			<span>
				{entry.title ?? entry.route}<small>
					{Math.floor(data.dwellStats.find((stat) => stat.id === entry.id)?.activeSeconds ?? 0)} s aktiv
					· {entry.visits} Besuche
				</small>
			</span>
			<button
				aria-label={'Verlauf löschen: ' + (entry.title ?? entry.route)}
				onclick={() => learningMemory.deleteEntry('history', entry.id)}
			>
				Löschen
			</button>
		</div>
	{:else}<p>Noch keine Inhalte besucht.</p>{/each}
	<h3>Erkannte Interessen</h3>
	{#each data.inferredInterests as entry (entry.topicId)}
		<div class="row">
			<span>{entry.topicId}</span><button
				aria-label={'Interesse löschen: ' + entry.topicId}
				onclick={() => learningMemory.deleteEntry('interest', entry.topicId)}
			>
				Löschen
			</button>
		</div>
	{:else}<p>Noch keine Interessen erkannt.</p>{/each}
	<h3>Gespeicherte Fragen &amp; Notizen</h3>
	{#each data.savedNotesAndQuestions as entry (entry.id)}
		<div class="row">
			<span>
				<small>
					{entry.kind === 'note' ? 'Notiz' : 'Frage'} · {entry.sectionTitle ??
						entry.topic ??
						entry.route}
				</small>{entry.text}
			</span>
			<button
				aria-label={'Eintrag löschen: ' + entry.text}
				onclick={() => learningMemory.deleteEntry('note', entry.id)}
			>
				Löschen
			</button>
		</div>
	{:else}<p>Noch keine Fragen oder Notizen gespeichert.</p>{/each}
	<label>
		<input type="checkbox" checked={share} onchange={(e) => onshare(e.currentTarget.checked)} /> Kontext
		mit Live-API teilen
	</label>
	<button class="clear" onclick={onclear}>Alles löschen</button>
</section>

<style>
	section {
		display: grid;
		gap: var(--space-s);
	}
	h3,
	label {
		margin-block-start: var(--space-m);
		font-size: var(--type-body);
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-s);
		border-bottom: var(--hairline-width) solid var(--hairline);
	}
	small,
	p {
		display: block;
		color: var(--text-muted);
		font-size: var(--type-meta);
	}
	button,
	label {
		min-height: var(--hit);
	}
	button {
		border: 0;
		color: var(--text);
		background: transparent;
		cursor: pointer;
	}
	label {
		display: flex;
		align-items: center;
		gap: var(--space-s);
	}
	.clear {
		justify-self: start;
		padding-inline: var(--space-m);
		border-radius: var(--radius-pill);
		background: var(--deviation);
		color: var(--deviation-text);
	}
</style>
