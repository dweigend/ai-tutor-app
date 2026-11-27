<script lang="ts">
	interface Props {
		caption: string;
		columns: readonly string[];
		rows: readonly (readonly string[])[];
	}

	let { caption, columns, rows }: Props = $props();
</script>

<!--
	Every mark carries its data as a hidden table (DESIGN.md §9.3i); the SVG is aria-hidden. The
	wrapper hides it: a table ignores a 1px width and overflow and would widen the page.
-->
<div class="visually-hidden">
	<table>
		<caption>{caption}</caption>
		<thead>
			<tr>
				{#each columns as column, index (index)}<th scope="col">{column}</th>{/each}
			</tr>
		</thead>
		<tbody>
			{#each rows as row, rowIndex (rowIndex)}
				<tr>
					{#each row as cell, index (index)}
						{#if index === 0}<th scope="row">{cell}</th>{:else}<td>{cell}</td>{/if}
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>
