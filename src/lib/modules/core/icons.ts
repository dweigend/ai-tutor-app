/**
 * The icon set (ui/DESIGN.md §7): the only source of signs in the app. Every icon is drawn on a
 * 24 × 24 grid as open strokes; Icon.svelte adds the 1.5px stroke, round caps and joins and
 * `currentColor`. An icon is a list of SVG path data, so nothing but a stroke can be drawn:
 * no fills, no second weight, no sparkle. A new sign is one more entry here plus a row in
 * DESIGN.md §7 that names its meaning.
 */
export const ICONS = {
	// Base set (issue #33).
	'arrow-right': ['M5 12h14', 'M13 6l6 6-6 6'],
	'arrow-left': ['M19 12H5', 'M11 6l-6 6 6 6'],
	close: ['M6 6l12 12', 'M18 6L6 18'],
	check: ['M5 12.5l4.5 4.5L19 7.5'],
	grid: ['M4.5 4.5h6v6h-6z', 'M13.5 4.5h6v6h-6z', 'M4.5 13.5h6v6h-6z', 'M13.5 13.5h6v6h-6z'],
	volume: [
		'M4 9.5h3.5L12 5.5v13l-4.5-4H4z',
		'M15.5 9.25a4 4 0 0 1 0 5.5',
		'M18 6.5a8 8 0 0 1 0 11'
	],
	play: ['M8 5.5v13l10.5-6.5z'],
	pause: ['M7.5 6h3v12h-3z', 'M13.5 6h3v12h-3z'],
	plus: ['M12 5v14', 'M5 12h14'],
	minus: ['M5 12h14'],
	external: ['M10 7H5v12h12v-5', 'M14 5h5v5', 'M19 5l-8 8'],

	// Directions and places.
	'arrow-up': ['M12 19V5', 'M6 11l6-6 6 6'],
	'arrow-down': ['M12 5v14', 'M6 13l6 6 6-6'],
	home: ['M4 11l8-7 8 7', 'M6 9.5V20h12V9.5', 'M10 20v-6h4v6'],

	// Whiteboard.
	pen: ['M4 20l1-4.5L16.5 4 20 7.5 8.5 19z', 'M14 6.5l3.5 3.5'],
	eraser: ['M8.5 19L4 14.5l10-10 6 6-8.5 8.5z', 'M8.5 19H20', 'M9 9.5l6 6'],
	undo: ['M9 14L4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'],
	trash: ['M4 7h16', 'M10 4h4', 'M6 7l1 13h10l1-13', 'M10 11v5', 'M14 11v5'],
	save: ['M5 4h11l3 3v13H5z', 'M8 4v5h7V4', 'M8 20v-6h8v6'],
	wand: ['M4.5 19.5l10-10', 'M12.5 9.5l2 2', 'M15 3.5v2.5', 'M20.5 9H18', 'M19.5 4.5l-1.75 1.75'],
	sliders: [
		'M4 7h9',
		'M17 7h3',
		'M17 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0z',
		'M4 12h3',
		'M11 12h9',
		'M11 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0z',
		'M4 17h10',
		'M18 17h2',
		'M18 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0z'
	],

	// Marks.
	star: ['M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z'],
	flag: ['M6 21V4', 'M6 5h11l-2.5 4 2.5 4H6'],
	bookmark: ['M7 4h10v16l-5-4-5 4z'],

	// Speaking and media.
	mic: [
		'M12 3.5a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0v-5a3 3 0 0 1 3-3z',
		'M6 11.5a6 6 0 0 0 12 0',
		'M12 17.5V21'
	],
	send: ['M20 4L3.5 10.5l6.5 3 3 6.5z', 'M10 13.5L20 4'],
	video: ['M4 6h16v12H4z', 'M10.5 9.5v5l4-2.5z'],
	headphones: [
		'M4.5 14v-2a7.5 7.5 0 0 1 15 0v2',
		'M4.5 13.5h3v6H6a1.5 1.5 0 0 1-1.5-1.5z',
		'M19.5 13.5h-3v6H18a1.5 1.5 0 0 0 1.5-1.5z'
	],
	book: [
		'M12 6.5c-2-1.5-4.8-2-8-2v13c3.2 0 6 .5 8 2 2-1.5 4.8-2 8-2v-13c-3.2 0-6 .5-8 2z',
		'M12 6.5v13'
	],

	// The tutor.
	duck: [
		'M18 7.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z',
		'M17.8 6.6h3.2l-1.5 2.2h-1.7',
		'M15 6.75h.01',
		'M12 10.2c-2.6 1.6-5.6 1.9-8.5.8.3 5.2 3.6 8.5 8.8 8.5h2.2c3.4 0 6-2.3 6-5.3 0-1.5-.9-2.9-2.3-3.6'
	]
} as const satisfies Record<string, readonly string[]>;

export type IconName = keyof typeof ICONS;

export const ICON_NAMES = Object.keys(ICONS) as IconName[];
