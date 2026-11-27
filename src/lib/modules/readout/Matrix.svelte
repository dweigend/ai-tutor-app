<script lang="ts">
	interface Props {
		columns: number;
		rows: number;
		/**
		 * Played cells in reading order (row by row), or a state per cell. `'sign'` draws a full
		 * square in --text: a sign laid over the matrix (the pause ‖), never a played part.
		 */
		played: number | ((column: number, row: number) => boolean | 'sign');
		label: string;
	}

	let { columns, rows, played, label }: Props = $props();

	let cells = $derived(
		Array.from({ length: columns * rows }, (_, index) => {
			const column = index % columns;
			const row = Math.floor(index / columns);
			return typeof played === 'number' ? index < played : played(column, row);
		})
	);
</script>

<!-- Matrix cells use round marks at two sizes. They tick without a transition. -->
<div
	class="readout-matrix"
	role="img"
	aria-label={label}
	style:--matrix-columns={columns}
	style:--matrix-rows={rows}
>
	{#each cells as on, index (index)}
		<span class="readout-matrix-cell" data-on={on}></span>
	{/each}
</div>
