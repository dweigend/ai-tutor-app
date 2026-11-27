/** Data shapes of the Raster recipes (ui/DESIGN.md §11 P3). Plain values, no content import. */

/** One block of a SlabList: a real link with a title and one true reading. */
export interface Slab {
	id: string;
	href: string;
	title: string;
	/** One true reading on the right, e.g. `5 min`. */
	meta: string;
	/** done shows ■ instead of the reading; next is inverted. */
	state?: 'done' | 'next';
}
