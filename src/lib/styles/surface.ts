/**
 * The six v2 surfaces (ui/DESIGN.md §5) and the browser `theme-color` that follows them.
 * Hex values must match the palette in tokens.css; the browser check in
 * arbeitsplan/02-ui/pruefbeleg-v2-1.md compares both.
 */
import { SURFACE_COLORS, type Surface } from '../modules/surface-shell/surfaces.js';

export { SURFACE_COLORS, type Surface };

/** Without any data-surface the app ground is paper (tokens.css `:root`). */
export const DEFAULT_SURFACE: Surface = 'paper';

export function isSurface(value: string | undefined): value is Surface {
	return value !== undefined && Object.hasOwn(SURFACE_COLORS, value);
}

/** The nearest data-surface at height `y` (CSS px from the viewport top), centred. */
export function surfaceAt(doc: Document, y: number): Surface {
	const view = doc.defaultView;
	if (!view) return DEFAULT_SURFACE;
	const element = doc.elementFromPoint(view.innerWidth / 2, y);
	const value = element?.closest<HTMLElement>('[data-surface]')?.dataset.surface;
	return isSurface(value) ? value : DEFAULT_SURFACE;
}

/** The surface under the status bar: the nearest data-surface at the top centre of the viewport. */
export function surfaceAtTop(doc: Document): Surface {
	return surfaceAt(doc, 1);
}

/**
 * Calls `onSurface` with the surface just below a line (e.g. the bottom edge of a sticky bar)
 * whenever scrolling or resizing changes it. A bar that takes this surface as its own tone makes
 * the flat opener and the paper text below it switch hard at the bar, and `syncThemeColor`
 * follows. Checks once per frame at most; returns the cleanup function.
 */
export function followSurfaceBelow(
	doc: Document,
	line: () => number,
	onSurface: (surface: Surface) => void
): () => void {
	const view = doc.defaultView;
	if (!view) return () => {};
	let frame = 0;
	let last: Surface | undefined;
	const check = () => {
		frame = 0;
		const next = surfaceAt(doc, line() + 1);
		if (next === last) return;
		last = next;
		onSurface(next);
	};
	const schedule = () => {
		if (frame === 0) frame = view.requestAnimationFrame(check);
	};
	view.addEventListener('scroll', schedule, { passive: true });
	view.addEventListener('resize', schedule, { passive: true });
	schedule();
	return () => {
		view.removeEventListener('scroll', schedule);
		view.removeEventListener('resize', schedule);
		if (frame !== 0) view.cancelAnimationFrame(frame);
	};
}

function applyThemeColor(doc: Document): void {
	const meta = doc.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
	if (!meta) return;
	const color = SURFACE_COLORS[surfaceAtTop(doc)];
	if (meta.content !== color) meta.content = color;
}

/**
 * Keeps `<meta name="theme-color">` on the surface at the top of the screen. Re-checks once per
 * frame after DOM or data-surface changes (navigation, a shell switching its tone) and while the
 * page scrolls, so a coloured opener that scrolls away under the status bar hands over to the
 * paper below it (art direction V2-5). Returns the cleanup function.
 */
export function syncThemeColor(doc: Document): () => void {
	const view = doc.defaultView;
	if (!view) return () => {};
	let frame = 0;
	const schedule = () => {
		if (frame !== 0) return;
		frame = view.requestAnimationFrame(() => {
			frame = 0;
			applyThemeColor(doc);
		});
	};
	const observer = new MutationObserver(schedule);
	observer.observe(doc.body, {
		subtree: true,
		childList: true,
		attributes: true,
		attributeFilter: ['data-surface']
	});
	view.addEventListener('scroll', schedule, { passive: true });
	schedule();
	return () => {
		observer.disconnect();
		view.removeEventListener('scroll', schedule);
		if (frame !== 0) view.cancelAnimationFrame(frame);
	};
}
