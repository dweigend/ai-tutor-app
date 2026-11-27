/** Whiteboard challenges from the v3 editorial pass (#29). */
export interface WhiteboardChallenge {
	id: string;
	title: string;
	text: string;
	spoken: string;
	/** Where the content comes from, for review. */
	source: string;
	/** Tutor scenario that knows this content; the live tutor then asks within it. */
	scenarioId?: string;
}

export const CHALLENGE_MAX_CHARS = 48;
export const CHALLENGE_TITLE_MAX_CHARS = 32;

export const whiteboardChallenges: readonly WhiteboardChallenge[] = [
	{
		id: 'gd-drei-schritte',
		title: 'Drei Sprünge in der Parabel',
		text: 'Zeichne 3 Schritte: (w − 3)², w = 5, Lernrate 1.',
		spoken:
			'Zeichne drei Schritte auf w minus drei zum Quadrat, Start bei w gleich fünf, Lernrate eins.',
		source: 'Übung 1.1'
	},
	{
		id: 'gd-weg-zwei-achsen',
		title: 'Spur durch die steile Schlucht',
		text: 'Spur in x² + 10y² ab (1, 1), Lernrate 0,085.',
		spoken:
			'Zeichne die Spur in x Quadrat plus zehn y Quadrat ab eins Komma eins bei Lernrate null Komma null acht fünf.',
		source: 'Übung 1.6'
	},
	{
		id: 'bp-rechengraph',
		title: 'Gabelung im Rechengraphen',
		text: 'Zeichne L = (a · b + c)² und beide Pfade d → L.',
		spoken:
			'Zeichne L gleich, in Klammern, a mal b plus c, zum Quadrat, und beide Pfade von d nach L.',
		source: 'Übung 1.8'
	},
	{
		id: 'bp-preiskette',
		title: 'Vom Aufschlag bis zum Kassenbon',
		text: 'Zeichne die Preiskette P mit dem Pfad s → P.',
		spoken: 'Zeichne die Preiskette P mit dem Wirkpfad vom Aufschlag s bis zum Endpreis P.',
		source: 'Übung 1.7'
	},
	{
		id: 'softmax-temperatur',
		title: 'Drei Gewichte unter Temperatur',
		text: 'Zeichne Softmax für [6, 3, 0] bei T = 1 und 3.',
		spoken: 'Zeichne die Softmax-Balken für sechs, drei, null bei Temperatur eins und drei.',
		source: 'tutorials.ts Z. 219',
		scenarioId: 'softmax-ueberlauf'
	},
	{
		id: 'kausale-maske',
		title: 'Blicksperre in die Zukunft',
		text: 'Zeichne die kausale Maske für Position 0.',
		spoken: 'Zeichne die kausale Maske für Position null.',
		source: 'tutorials.ts Z. 239'
	}
];

/** The next challenge in a fixed order, so every press shows a new one and all six come round. */
export function nextChallenge(
	current: WhiteboardChallenge | null,
	list: readonly WhiteboardChallenge[] = whiteboardChallenges
): WhiteboardChallenge {
	const index = current ? list.findIndex((item) => item.id === current.id) : -1;
	return list[(index + 1) % list.length];
}
