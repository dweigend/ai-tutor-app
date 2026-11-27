<script lang="ts">
	import type { Snippet } from 'svelte';
	import { setCanvasContext } from './context.js';
	import { parseViewBox } from './geometry.js';

	interface Props {
		/** The drawing units of every mark inside; width and height set the aspect ratio. */
		viewBox?: string;
		/** A quiet grid of square dots behind the marks. */
		grid?: 'dots' | 'none';
		children: Snippet;
	}

	let { viewBox = '0 0 320 200', grid = 'none', children }: Props = $props();

	const id = $props.id();
	let size = $derived(parseViewBox(viewBox));

	setCanvasContext({
		get width() {
			return size.width;
		},
		get height() {
			return size.height;
		},
		get viewBox() {
			return viewBox;
		}
	});
</script>

<!--
	The drawing area: marks stack their own SVG layers here, text lies over them as DOM (DESIGN.md
	§9.3h). Lines are 1px and do not scale (vector-effect); the dot grid is made of squares (§3.3).
-->
<div class="figure-plate-canvas" style:aspect-ratio="{size.width} / {size.height}">
	{#if grid === 'dots'}
		<svg class="figure-plate-layer" {viewBox} aria-hidden="true" focusable="false">
			<defs>
				<pattern id="{id}-dots" width="16" height="16" patternUnits="userSpaceOnUse">
					<rect class="figure-plate-dot" x="7.5" y="7.5" width="1" height="1" />
				</pattern>
			</defs>
			<rect x="0" y="0" width={size.width} height={size.height} fill="url(#{id}-dots)" />
		</svg>
	{/if}
	{@render children()}
</div>
