import type { EditorialArticle, EditorialEpisode } from '$lib/content';

// The editorial voice decides the form label shown in the Bildzeile and in the list.
export const essayFormLabel: Readonly<Record<EditorialArticle['editorialStyle'], string>> = {
	zeit: 'Essay',
	'brand-eins': 'Reportage',
	economist: 'Analyse'
};

/** Listening time of an episode in whole minutes, as the list and the Bildzeile show it. */
export function episodeMinutes(episode: EditorialEpisode): number {
	return Math.round((episode.durationSeconds ?? 0) / 60);
}
