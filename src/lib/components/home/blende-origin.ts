/**
 * Finds the start page slot that belongs to a URL, for the tile wipe (issue #10, blende.ts).
 * Reads the DOM only: the start grid marks every cell with `data-slot` and paints a fixed bed
 * per slot (`data-bed`), whose box never moves while tiles swipe, drop or stack.
 */
const HOME_LINKS = '[data-home-grid] [data-slot] a[href]';

function sameTarget(link: URL, url: URL): boolean {
	return link.pathname === url.pathname && link.search === url.search && link.hash === url.hash;
}

/** The slot box of the tile linking to `url`, or of the first tile on its path; else undefined. */
export function homeTileRect(doc: Document, url: URL): DOMRect | undefined {
	const links = Array.from(doc.querySelectorAll<HTMLAnchorElement>(HOME_LINKS));
	const exact = links.find((link) => sameTarget(new URL(link.href), url));
	const link =
		exact ?? links.find((candidate) => new URL(candidate.href).pathname === url.pathname);
	const slot = link?.closest<HTMLElement>('[data-slot]')?.dataset.slot;
	if (!slot) return undefined;
	return doc.querySelector(`[data-home-grid] [data-bed="${slot}"]`)?.getBoundingClientRect();
}
