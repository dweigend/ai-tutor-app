<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { Icon, SwipeRow, type SwipeAction } from '$lib/modules';
	import { sketchTime, type SavedSketch } from './sketches';

	interface Props {
		open: boolean;
		sketches: readonly SavedSketch[];
		/** False when the browser refused to store; the list then lives for this visit only. */
		stored: boolean;
		saveMessage?: string;
		onload: (sketch: SavedSketch) => void;
		onremove: (ids: ReadonlySet<string>) => void;
		onkeep: (id: string, kept: boolean) => void;
		onexport: () => void;
	}

	let {
		open = $bindable(),
		sketches,
		stored,
		saveMessage,
		onload,
		onremove,
		onkeep,
		onexport
	}: Props = $props();

	// "Weg" waits until the sheet closes, so the undo line of the row can still bring it back.
	let removed = $state(new Set<string>());

	function action(sketch: SavedSketch, kind: SwipeAction) {
		if (kind === 'dismiss') removed = new Set(removed).add(sketch.id);
		else onkeep(sketch.id, true);
	}

	function undo(sketch: SavedSketch, kind: SwipeAction) {
		if (kind === 'later') {
			onkeep(sketch.id, false);
			return;
		}
		const next = new Set(removed);
		next.delete(sketch.id);
		removed = next;
	}

	function openChange(next: boolean) {
		if (next || !removed.size) return;
		onremove(removed);
		removed = new Set();
	}

	function strokeCount(sketch: SavedSketch): string {
		return `${sketch.strokes.length} ${sketch.strokes.length === 1 ? 'Strich' : 'Striche'}`;
	}
</script>

<Dialog.Root bind:open onOpenChange={openChange}>
	<Dialog.Portal>
		<Dialog.Content class="sketch-sheet" data-surface="white">
			<div class="sheet-head" data-row>
				<Dialog.Title class="m-label sheet-title">
					Skizzen [{String(sketches.length).padStart(2, '0')}]
				</Dialog.Title>
				<Dialog.Close class="m-icon-button" aria-label="Schließen">
					<Icon name="close" />
				</Dialog.Close>
			</div>
			<Dialog.Description class="visually-hidden">
				Gespeicherte Skizzen. Antippen holt eine Skizze auf die Fläche, rechts wischen merkt sie,
				links wischen entfernt sie.
			</Dialog.Description>
			{#if saveMessage}
				<p class="sheet-note" role="status">{saveMessage}</p>
			{/if}
			<ul class="sheet-list">
				{#each sketches as sketch (sketch.id)}
					<li>
						<SwipeRow
							name="Skizze {sketchTime(sketch.savedAt)}"
							onaction={(kind) => action(sketch, kind)}
							onundo={(kind) => undo(sketch, kind)}
						>
							<button
								type="button"
								class="sheet-load"
								onclick={() => {
									onload(sketch);
									open = false;
									openChange(false);
								}}
							>
								<span class="sheet-time">{sketchTime(sketch.savedAt)}</span>
								<span class="sheet-count">{strokeCount(sketch)}</span>
								{#if sketch.kept}
									<span class="sheet-sign" aria-hidden="true">■</span>
									<span class="visually-hidden">gemerkt</span>
								{/if}
							</button>
						</SwipeRow>
					</li>
				{/each}
			</ul>
			{#if !stored}
				<p class="sheet-note">Nur temporär gespeichert.</p>
			{/if}
			<button type="button" class="m-hit m-key m-keyword sheet-export" onclick={onexport}>
				Exportieren
			</button>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	/* A sheet from the bottom edge: white plate, the 1px joint on top, a hard edge on entry. */
	:global(.sketch-sheet) {
		position: fixed;
		inset-inline: 0;
		inset-block-end: 0;
		z-index: 30;
		display: flex;
		flex-direction: column;
		max-block-size: 70dvh;
		padding-block-end: env(safe-area-inset-bottom);
		border-block-start: var(--hairline-width) solid var(--hairline);
		animation: sketch-sheet-in var(--change-time) var(--change-easing);
	}

	.sheet-head {
		display: flex;
		flex: none;
		align-items: center;
		justify-content: space-between;
		block-size: var(--bar);
		padding-inline-end: var(--gutter);
	}

	:global(.sheet-title) {
		padding-inline: var(--gutter);
	}

	.sheet-list {
		flex: 1;
		min-block-size: 0;
		margin: 0;
		padding: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		border-block-start: var(--hairline-width) solid var(--hairline);
		list-style: none;
	}

	.sheet-load {
		display: flex;
		align-items: center;
		gap: var(--step-3);
		inline-size: 100%;
		min-block-size: var(--cell);
		padding: 0;
		border: 0;
		border-radius: var(--radius);
		background: transparent;
		color: inherit;
		font-family: var(--font-mono);
		font-size: var(--type-body);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		text-align: start;
		cursor: pointer;
	}

	.sheet-load:focus-visible {
		outline: var(--focus-width) solid var(--focus);
		outline-offset: calc(-1 * var(--focus-width));
	}

	.sheet-count {
		color: var(--text-muted);
		font-size: var(--type-label);
		font-weight: 400;
	}

	.sheet-sign {
		margin-inline-start: auto;
	}

	.sheet-note {
		padding: var(--step-2) var(--gutter);
		font-family: var(--font-mono);
		font-size: var(--type-label);
	}

	.sheet-export {
		flex: none;
		inline-size: 100%;
		min-block-size: var(--action-zone);
	}

	@media (prefers-reduced-motion: reduce) {
		:global(.sketch-sheet) {
			animation: none;
		}
	}

	@keyframes sketch-sheet-in {
		from {
			clip-path: inset(100% 0 0 0);
		}
	}
</style>
