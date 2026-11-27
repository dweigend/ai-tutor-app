import { error } from '@sveltejs/kit';
import { findEntry, magazinSlugs } from '$lib/components/magazin/article';
import type { EntryGenerator, PageLoad } from './$types';

/* adapter-static prerenders every article and every episode as its own page (DESIGN.md §11.7). */
export const entries: EntryGenerator = () => magazinSlugs().map((slug) => ({ slug }));

export const load: PageLoad = ({ params }) => {
	const entry = findEntry(params.slug);
	if (!entry) error(404, 'Diesen Beitrag gibt es nicht.');
	return { entry };
};
