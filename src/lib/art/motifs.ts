import type { Asset } from '$app/types';

interface Motif {
	position: string;
	alt: string;
}

/** Compressed illustrations shared by editorial surfaces. */
export const MOTIFS = {
	uebungen: { position: '50% 50%', alt: 'Schwarzes Kuppelraster auf orangefarbenem Grund' },
	tutor: { position: '70% 50%', alt: 'Ente im Streiflicht' },
	erklaerungen: { position: '50% 50%', alt: 'Papierflächen, die sich zu einem Fächer öffnen' },
	magazin: { position: '50% 50%', alt: 'Druckgrafik eines Schaltpults auf Karmesin' },
	whiteboard: { position: '50% 52%', alt: 'Zwei Figuren im Schatten eines Kuppelrasters' },
	podcast: { position: '50% 78%', alt: 'Vier Tonbandspulen in einer Reihe' },
	aktivitaet: { position: '50% 58%', alt: 'Messlichter auf einer dunklen Schalttafel' },
	'essay-lernstand': { position: '50% 75%', alt: 'Zwei Figuren vor einer Kuppel auf Gelb' },
	'essay-tutor': { position: '70% 70%', alt: 'Eine Person vor einem Terminal' },
	'essay-transformer': { position: '50% 56%', alt: 'Beleuchtete Kammern einer offenen Kuppel' },
	'tutorial-schichten': { position: '50% 50%', alt: 'Überlagerte Kreise in Orange und Graphit' },
	'tutorial-schalttafel': { position: '50% 65%', alt: 'Schwarze Druckgrafik eines Schaltpults' },
	'home-lernraten': { position: '50% 60%', alt: 'Eine Kugel und ihre Spur am Hang eines Tals' },
	'home-schaltwerk': {
		position: '50% 55%',
		alt: 'Ein Lichtstrahl läuft durch drei transparente Schichten'
	},
	'home-magazin': { position: '50% 52%', alt: 'Lochkarten fächern sich aus einer Maschine heraus' },
	'home-whiteboard': {
		position: '50% 55%',
		alt: 'Eine mit Kreide gezeichnete Bahn auf schwarzem Grund'
	},
	'home-lernstand': {
		position: '50% 50%',
		alt: 'Zwei Druckflächen mit verschieden dichten Rastern'
	},
	'home-attention': { position: '50% 48%', alt: 'Ein Glasprisma fängt einen Lichtstrahl' },
	'home-delegieren': {
		position: '50% 60%',
		alt: 'Bedienfeld eines Großrechners mit Reihen von Schaltern'
	},
	'home-sicherheit': {
		position: '50% 59%',
		alt: 'Dünne Messmarken ragen unterschiedlich hoch über eine Horizontlinie'
	}
} as const satisfies Record<string, Motif>;

export type MotifId = keyof typeof MOTIFS;
export type MotifFormat = 'avif' | 'webp';

export const MOTIF_WIDTHS = [400, 800] as const;

export function motifSource(
	id: MotifId,
	width: (typeof MOTIF_WIDTHS)[number],
	format: MotifFormat
): Asset {
	return `/art/tiles/${id}-${width}.${format}`;
}

export function motifFallback(id: MotifId): Asset {
	return `/art/${id}.webp`;
}

export function motifSrcset(
	id: MotifId,
	format: MotifFormat,
	url: (path: Asset) => string
): string {
	return MOTIF_WIDTHS.map((width) => `${url(motifSource(id, width, format))} ${width}w`).join(', ');
}
