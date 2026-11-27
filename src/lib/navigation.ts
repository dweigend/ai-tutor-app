import type { MotifId } from '$lib/art/motifs';
import type { Surface } from '$lib/styles/surface';

/** Surface colours an area can take; each one has a checked text pair in tokens.css. */
export type TileTone = 'paper' | 'white' | 'ink' | 'orange' | 'crimson';

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
 * Every app area in its canonical order.
 * The start page is the only overview; sub pages lead back to it through the global home button.
 * The tone matches the dominant surface of the area's motif.
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

/**
 * Content type of a start tile. It is told by the TypeBadge and the type colour alone
 * (`--type-*` in tokens.css). Signal yellow belongs to the duck and is never a tile colour.
 */
export type TileType =
	'exercise' | 'explanation' | 'magazine' | 'whiteboard' | 'activity' | 'today';

/** Flat graphics a tile can carry instead of a picture (`$lib/art/TileGraphic.svelte`). */
export type TileGraphicId = 'valley' | 'board' | 'pulse' | 'fader' | 'pages';

export interface HomeTile {
	/** Stable id; it also names the tile in the viewer's saved board. */
	id: string;
	/** The one visible line: at most three words. */
	title: string;
	type: TileType;
	path: AreaPath;
	/** A full-bleed picture, or a flat graphic in the type colour. */
	art?: MotifId;
	graphic?: TileGraphicId;
}

/**
 * The areas of the app as start tiles, in their first order. They always stand on the start
 * page; topics from the learning queue land in front of them (issue #58).
 */
export const homeTiles: readonly HomeTile[] = [
	{ id: 'uebungen', title: 'Übungen', type: 'exercise', path: '/uebungen', art: 'uebungen' },
	{
		id: 'erklaerungen',
		title: 'Erklärungen',
		type: 'explanation',
		path: '/erklaerungen',
		graphic: 'valley'
	},
	{
		id: 'whiteboard',
		title: 'Whiteboard',
		type: 'whiteboard',
		path: '/whiteboard',
		graphic: 'board'
	},
	{ id: 'magazin', title: 'Magazin', type: 'magazine', path: '/magazin', art: 'magazin' },
	{ id: 'aktivitaet', title: 'Aktivität', type: 'activity', path: '/aktivitaet', graphic: 'pulse' }
];
