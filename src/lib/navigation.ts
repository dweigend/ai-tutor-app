import type { MotifId } from '$lib/art/motifs';
import type { IconName } from '$lib/modules';
import type { Surface } from '$lib/styles/surface';

/** Surface colours a tile can take; each one has a checked text pair in tokens.css. */
export type TileTone = 'paper' | 'white' | 'ink' | 'orange' | 'yellow' | 'crimson';

/** Label colour: dark is ink (#0A0A0A), light is white. Chosen per calm zone, not per tone. */
export type LabelTone = 'dark' | 'light';

export type LabelCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export type AreaPath =
	'/magazin' | '/tutor' | '/uebungen' | '/erklaerungen' | '/whiteboard' | '/aktivitaet';

export interface Area {
	path: AreaPath;
	label: string;
	/** Colour of the area's start tile. */
	tone: TileTone;
	/** Surface of the sub page under SurfaceShell (DESIGN.md §5, set in issue #9). */
	surface: Surface;
	art?: MotifId;
}

/**
 * Every app area, in the order of their two-digit number in the top bar (`01 / ÜBUNGEN`).
 * The start page is the only overview; sub pages lead back to it through the grid sign in the
 * SurfaceShell bar. The tone matches the dominant surface of the area's motif.
 */
export const areas: readonly Area[] = [
	{
		path: '/uebungen',
		label: 'Übungen',
		tone: 'orange',
		surface: 'orange',
		art: 'uebungen'
	},
	{ path: '/tutor', label: 'Tutor', tone: 'ink', surface: 'ink', art: 'tutor' },
	{
		path: '/erklaerungen',
		label: 'Erklärungen',
		tone: 'paper',
		surface: 'paper',
		art: 'erklaerungen'
	},
	{
		path: '/magazin',
		label: 'Magazin',
		tone: 'crimson',
		surface: 'paper',
		art: 'magazin'
	},
	{
		path: '/whiteboard',
		label: 'Whiteboard',
		tone: 'white',
		surface: 'white',
		art: 'whiteboard'
	},
	{
		path: '/aktivitaet',
		label: 'Aktivität',
		tone: 'ink',
		surface: 'ink',
		art: 'aktivitaet'
	}
];

/** Two-digit number of an area, its real position in `areas`. */
export function areaNumber(path: AreaPath): string {
	return String(areas.findIndex((area) => area.path === path) + 1).padStart(2, '0');
}

export function areaFor(path: AreaPath): Area {
	const area = areas.find((candidate) => candidate.path === path);
	if (!area) throw new Error(`Unknown area: ${path}`);
	return area;
}

export type Importance = 'high' | 'normal';

export interface HomeLink {
	id: string;
	category: string;
	title: string;
	path: AreaPath;
	slug?: string;
	taskId?: string;
	tone: TileTone;
}

export type HomeOffer = HomeLink & { art: MotifId } & (
		{ importance: 'normal' } | { importance: 'high'; subtitle: string; icon: IconName }
	);

export function homeLinkLabel({ category, title }: HomeLink): string {
	// CSS supplies the visual capitals; the spoken label can use natural casing.
	return `${category}: ${title}`;
}

export const homeTutor = {
	id: 'tutor',
	category: 'Tutor',
	title: 'Sparring ohne Vorsagen',
	path: '/tutor',
	tone: 'ink'
} as const satisfies HomeLink;

/** Stable ids also identify the offers in the viewer's saved arrangement. */
export const homeOffers: readonly HomeOffer[] = [
	{
		id: 'uebung-lernraten',
		category: 'Übung',
		title: 'Wettlauf zum tiefsten Punkt',
		importance: 'high',
		subtitle: 'Am selben Hang macht Programm B viermal so große Schritte.',
		icon: 'pen',
		path: '/uebungen',
		taskId: 'a-gd-schritte-vorhersagen',
		tone: 'orange',
		art: 'home-lernraten'
	},
	{
		id: 'erklaerungen',
		category: 'Erklärung',
		title: 'Im Schaltwerk der Gewichte',
		importance: 'high',
		subtitle: 'Erst vorhersagen, dann Attention und Rückfluss am Regler testen.',
		icon: 'sliders',
		path: '/erklaerungen',
		tone: 'ink',
		art: 'home-schaltwerk'
	},
	{
		id: 'magazin',
		category: 'Magazin',
		title: 'Was nach dem grünen Haken bleibt',
		importance: 'normal',
		path: '/magazin',
		tone: 'crimson',
		art: 'home-magazin'
	},
	{
		id: 'whiteboard',
		category: 'Whiteboard',
		title: 'Rechenwege von Hand ziehen',
		importance: 'normal',
		path: '/whiteboard',
		tone: 'ink',
		art: 'home-whiteboard'
	},
	{
		id: 'podcast-lampe',
		category: 'Podcast',
		title: 'Die grüne Lampe lügt',
		importance: 'normal',
		path: '/magazin',
		slug: 'die-gruene-lampe-luegt',
		tone: 'white',
		art: 'podcast'
	},
	{
		id: 'aktivitaet',
		category: 'Aktivität',
		title: 'Was ohne Hilfe trägt',
		importance: 'normal',
		path: '/aktivitaet',
		tone: 'ink',
		art: 'aktivitaet'
	},
	{
		id: 'essay-loesung',
		category: 'Essay',
		title: 'Was morgen von der Lösung bleibt',
		importance: 'high',
		subtitle: 'Warum hohe Übungswerte mit Chat im ungestützten Test wegbrechen.',
		icon: 'book',
		path: '/magazin',
		slug: 'was-von-der-loesung-bleibt',
		tone: 'yellow',
		art: 'home-lernstand'
	},
	{
		id: 'erklaerung-attention',
		category: 'Erklärung',
		title: 'Warum Attention einen Teiler braucht',
		importance: 'high',
		subtitle: 'Eine einzige Division hält die Gewichte im Transformer beweglich.',
		icon: 'sliders',
		path: '/erklaerungen',
		tone: 'ink',
		art: 'home-attention'
	},
	{
		id: 'essay-maschine',
		category: 'Essay',
		title: 'Wo das Delegieren kippt',
		importance: 'normal',
		path: '/magazin',
		slug: 'welche-arbeit-die-maschine-uebernimmt',
		tone: 'orange',
		art: 'home-delegieren'
	},
	{
		id: 'essay-sicher',
		category: 'Essay',
		title: 'Wie sicher bist du dir wirklich?',
		importance: 'normal',
		path: '/magazin',
		slug: 'wie-sicher-sind-sie',
		tone: 'ink',
		art: 'home-sicherheit'
	}
];
