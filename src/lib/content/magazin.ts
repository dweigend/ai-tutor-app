import type { MotifId } from '../art/motifs.js';
import { paragraphs } from './markdown.js';
import { essaySource, repoSource, studies, study } from './sources.js';
import type {
	ArticleFacts,
	ArticleParagraph,
	ArticleSection,
	Evidence,
	FigureSpec,
	HermesEssay,
	MagazineEssay,
	MagazineIntro,
	PodcastEpisode
} from './types.js';

export interface ArtImage {
	src: `/art/${string}.webp`;
	alt: string;
	/** Base name of the cropped variants in `static/art/tiles/` (400 and 800, AVIF and WebP). */
	tile?: string;
	/** `object-position` of the motif in a 4:3 frame. */
	position?: string;
}

/** The surface of an opener: the motif's colour, as on its start tile. */
export type MagazinTone = 'paper' | 'white' | 'crimson' | 'ink';

/** The one recommendation under an article: the next article, or the matching exercise. */
export type ArticleNext = { kind: 'magazin'; id: string } | { kind: 'uebung'; taskId: string };

// Layout fields extend the shared contract; `deck` carries the subtitle.
export interface EditorialEssay extends MagazineEssay {
	kicker: string;
	pullQuote: string;
	art: ArtImage;
	/** The approved lead question (textredaktion-v2.md §4); `title` stays as it was. */
	question?: string;
}

export interface EditorialImage {
	after: string;
	motif: MotifId;
	caption: string;
}

export interface InteractiveFigure {
	kind: 'bastani' | 'product' | 'softmax';
	after: string;
	title: string;
	caption: string;
}

/** An essay in the Hermes schema plus the magazine's layout fields. */
export interface EditorialArticle extends HermesEssay, MagazineIntro {
	id: string;
	kicker: string;
	editorialStyle: MagazineEssay['editorialStyle'];
	readingMinutes: number;
	pullQuote: string;
	art: ArtImage;
	tone: MagazinTone;
	next?: ArticleNext;
	figure: InteractiveFigure;
	inlineImages: readonly EditorialImage[];
}

export interface EditorialEpisode extends PodcastEpisode {
	kicker: string;
	/** The approved lead question (textredaktion-v2.md §4). */
	question: string;
	keyPoints: readonly string[];
	art: ArtImage;
	tone: MagazinTone;
}

/** A paragraph with the evidence it rests on. */
type ParagraphInput = string | { text: string; cites: readonly string[] };

function cited(text: string, ...cites: string[]): ParagraphInput {
	return { text, cites };
}

/** One Hermes section; paragraph ids are the section id plus the paragraph index. */
function section(
	id: string,
	options: Omit<ArticleSection, 'id' | 'paragraphs'>,
	...inputs: ParagraphInput[]
): ArticleSection {
	const paragraphList: ArticleParagraph[] = inputs.map((input, index) => ({
		id: `${id}-p${index}`,
		text: typeof input === 'string' ? input : input.text,
		evidenceIds: typeof input === 'string' ? [] : input.cites
	}));
	return { id, ...options, paragraphs: paragraphList };
}

function facts(cells: ArticleFacts['cells'], after?: string): ArticleFacts {
	return { cells, after };
}

const articleLernstand: EditorialArticle = {
	id: 'was-von-der-loesung-bleibt',
	kicker: 'Lernen mit KI',
	title: 'Was ist von der Lösung morgen noch da?',
	question: 'Was ist von deiner Lösung morgen noch da?',
	teaser: 'Was eine richtige Lösung über dein Können verrät.',
	deck: 'Zwei Studierende reichen am Abend dieselbe richtige Lösung ein. Am nächsten Morgen genügt eine geänderte Zahl an der Tafel, um sie zu trennen. Warum glattes Bearbeiten täuscht und weshalb Sprachmodelle diese Lücke vergrößern.',
	editorialStyle: 'zeit',
	readingMinutes: 4,
	pullQuote: 'Wer nur den ersten Messpunkt misst, misst das Werkzeug, nicht die Person.',
	tone: 'white',
	art: {
		src: '/art/essay-lernstand.webp',
		alt: 'Kleine Figur auf einer dunklen Wabenkuppel',
		tile: 'essay-lernstand',
		position: '50% 100%'
	},
	next: { kind: 'uebung', taskId: 'a-gd-schritte-vorhersagen' },
	figure: {
		kind: 'bastani',
		after: 'loesung-studien-p0',
		title: 'Übungsleistung mit KI gegen Nachtest ohne Hilfe (Bastani et al., PNAS 2025)',
		caption:
			'Abstand zur Kontrollgruppe: Beim Üben liegen offener Chat (+48 %) und Tutor (+127 %) vorn. Im Test ohne Hilfe fällt die Chat-Gruppe zurück (−17 %). Beim Tutor ist kein statistisch signifikanter Unterschied messbar (n. s.).'
	},
	inlineImages: [
		{
			after: 'loesung-messpunkte-p1',
			motif: 'aktivitaet',
			caption:
				'Erst die späten Messpunkte ohne Werkzeug zeigen, was vom glatten Übungsabend im Gedächtnis geblieben ist.'
		},
		{
			after: 'loesung-tutor-p0',
			motif: 'uebungen',
			caption:
				'Statt grüne Häkchen zu sammeln, legt ein ehrliches System am nächsten Morgen dieselbe Struktur mit neuen Zahlen vor.'
		}
	],
	sections: [
		section(
			'loesung-auftakt',
			{
				kind: 'opening',
				facts: facts([
					{ label: 'Messpunkte', value: '4' },
					{ label: 'Übung mit Chat', value: '+48 %' },
					{ label: 'Test ohne Hilfe', value: '−17 %' }
				])
			},
			'Dienstagabend, kurz nach zehn. Lena und Jonas laden dasselbe Übungsblatt hoch: Gradientenabstieg, Aufgabe drei. Beide Lösungen sind richtig, beide sauber kommentiert. Lena hat zwei Stunden gebraucht und sich dreimal verrechnet. Jonas war nach vierzig Minuten fertig. Ein Chatfenster hat ihm die Schleife geschrieben, er hat sie gelesen, verstanden, wie er fand, und eingereicht.',
			'Mittwochmorgen, Tutorium. Dieselbe Aufgabe steht an der Tafel, nur die Lernrate ist eine andere. Lena rechnet. Jonas erkennt die Form der alten Lösung wieder und kommt nicht weiter.'
		),
		section(
			'loesung-messpunkte',
			{ heading: 'Vier Zeitpunkte trennen Werkzeug und Gedächtnis' },
			cited(
				'Die Szene trennt zwei Dinge, die im Hochschulalltag fast immer zusammenfallen: die Leistung beim Bearbeiten und das, was davon bleibt. Die Lernpsychologie unterscheidet beides seit Jahrzehnten. Soderstrom und Bjork haben die Befunde 2015 zusammengetragen. Was während des Übens glatt läuft, sagt erstaunlich wenig darüber, was eine Woche später noch abrufbar ist. Manchmal sagt es sogar das Gegenteil.',
				'soderstrom-bjork-2015'
			),
			'Für KI-Hilfe folgt daraus eine nüchterne Messregel. Man braucht vier Messpunkte statt einem: die Leistung mit KI, sofort danach ohne KI, einige Tage später ohne KI und an einer neuen Aufgabe ohne KI. Die ersten beiden messen das Bearbeiten. Erst die letzten beiden messen Behalten und Übertragen.'
		),
		section(
			'loesung-studien',
			{
				heading: 'Steile Kurven beim Üben, Ernüchterung im Nachtest'
			},
			cited(
				'Die bislang deutlichste Warnung kommt aus türkischen Schulen. Bastani und Kolleg:innen ließen knapp 1.000 Schüler:innen Mathematik mit GPT-4 üben (PNAS, 2025). Wer beim Üben einen offenen Chat nutzen durfte, schnitt in den Übungen um 48 Prozent besser ab als die Kontrollgruppe. Mit einer Tutor-Variante, die Lösungen zurückhielt, waren es 127 Prozent. Dann kam der Test ohne Hilfe. Die Chat-Gruppe lag 17 Prozent unter der Kontrolle. Bei der Tutor-Gruppe war kein statistisch signifikanter Unterschied zur Kontrollgruppe messbar. Welche Leitplanke das bewirkt hat, lässt das Design offen. Sie wurden als Bündel getestet.',
				'bastani-2025'
			),
			cited(
				'Es gibt Gegenbefunde, und sie verdienen dieselbe Sorgfalt. In Harvard arbeiteten Studierende der Einführungsphysik in einem randomisierten Crossover-Design mit einem vorstrukturierten KI-Tutor (Kestin et al., 2025). Im Soforttest lag die Effektstärke bei 0,63, die mediane Bearbeitungszeit bei 49 Minuten gegenüber 60 Minuten Präsenz. Ob der Vorsprung Wochen später trägt, hat die Studie nicht gemessen.',
				'kestin-2025'
			),
			cited(
				'An der TU München verglichen Bassner und Kolleg:innen (2026) bei 275 ausgewerteten Studierenden ChatGPT, den Lerntutor Iris und eine Kontrollgruppe in einer 90-minütigen Java-Übung. Die mittleren Übungsscores lagen bei 71,8 Prozent mit ChatGPT, 57,5 Prozent mit Iris und 29,9 Prozent ohne KI. Beide KI-Gruppen berichteten weniger Frust. Im unmittelbaren Nachtest zum Konzept- und Codeverständnis war jedoch kein zusätzlicher Gewinn nachweisbar.',
				'bassner-2026'
			),
			'Liest man die Studien nebeneinander, fällt ein Muster auf. Der Übungsscore ist überall die schönste Zahl. Er ist zugleich die Zahl, die am wenigsten darüber verrät, was bleibt.'
		),
		section(
			'loesung-tutor',
			{ heading: 'Auf die Variante optimieren statt auf das Häkchen' },
			'Für ein Tutorsystem ist das keine Randnotiz, sondern eine Konstruktionsvorgabe. Wenn die Bearbeitungsleistung täuschen kann, darf sie nicht die Zahl sein, auf die das System optimiert. Ein Tutor, der Lena und Jonas ernst nimmt, fragt am Mittwochmorgen nicht, ob gestern alles grün war. Er stellt die Variante. Und er notiert, unter welchen Bedingungen sie gelöst wurde: allein, mit einem Hinweis oder nach einem gezeigten Beispiel.',
			'Das ist unbequemer, als es klingt. Eine Variante ohne Hilfe fühlt sich schlechter an als die zweite Runde mit Chat, und die Kurve im Dashboard steigt langsamer. Wer KI-Hilfe danach beurteilt, wie gut sich das Lernen anfühlt, wählt verlässlich die falsche Variante.'
		),
		section(
			'loesung-frage',
			{ heading: 'Welche Leitplanke trägt, ist noch unbewiesen' },
			cited(
				'Redlich bleibt festzuhalten: Niemand weiß bisher, welche einzelne Regel eines Tutors den Unterschied macht. Bastanis Leitplanken wirkten als Paket. Kestins Tutor war sorgfältig vorstrukturiert, aber nicht gegen einen späten Test geprüft.',
				'bastani-2025',
				'kestin-2025'
			),
			'Die Frage, die alle Messungen ordnen sollte, ist dennoch einfach. Sie lautet nicht, ob die Lösung heute stimmt. Sie lautet: Was ist von ihr morgen noch da?'
		)
	],
	sources: [
		study('soderstromBjork'),
		study('bastani'),
		study('kestin'),
		study('bassner'),
		essaySource('barnett-ceci-2002', {
			label: 'Barnett & Ceci 2002 · Taxonomie für Transfer',
			href: 'https://doi.org/10.1037/0033-2909.128.4.612'
		}),
		essaySource(
			'reader-forschungsstand',
			repoSource('Reader · Forschungsstand', 'reader/03-forschungsstand.md')
		),
		essaySource(
			'essay-ki-lernen',
			repoSource('Essay KI und Lernen, S. 4–5', 'research/essay-ki-lernen.pdf')
		)
	],
	evidenceById: {
		'soderstrom-bjork-2015': {
			sourceId: 'soderstromBjork',
			claim:
				'Was während des Übens glatt läuft, sagt erstaunlich wenig darüber, was eine Woche später noch abrufbar ist.',
			status: 'complete'
		},
		'bastani-2025': {
			sourceId: 'bastani',
			claim:
				'Wer beim Üben einen offenen Chat nutzen durfte, schnitt in den Übungen um 48 Prozent besser ab als die Kontrollgruppe. Die Chat-Gruppe lag 17 Prozent unter der Kontrolle.',
			limitations: 'Welche Leitplanke das bewirkt hat, lässt das Design offen.',
			status: 'complete'
		},
		'kestin-2025': {
			sourceId: 'kestin',
			claim: 'Im Soforttest lag die Effektstärke bei 0,63.',
			limitations: 'Ob der Vorsprung Wochen später trägt, hat die Studie nicht gemessen.',
			status: 'complete'
		},
		'bassner-2026': {
			sourceId: 'bassner',
			claim:
				'Im unmittelbaren Nachtest zum Konzept- und Codeverständnis war jedoch kein zusätzlicher Gewinn nachweisbar.',
			status: 'complete'
		}
	}
};

const articleDelegation: EditorialArticle = {
	id: 'welche-arbeit-die-maschine-uebernimmt',
	kicker: 'Delegation',
	title: 'Welche Arbeit soll die Maschine übernehmen?',
	question: 'Welche Arbeit darf die Maschine übernehmen?',
	teaser: 'Wann du KI-Code selbst prüfen musst.',
	deck: 'Eine Studentin lässt sich sieben Zeilen Rückwärtsrechnung von einem Sprachmodell schreiben. Ihr Test leuchtet grün, bis zwei verschiedene Faktoren aufeinandertreffen. Warum die Grenze für sinnvolle KI-Hilfe mit dem eigenen Können wandert.',
	editorialStyle: 'brand-eins',
	readingMinutes: 5,
	pullQuote: 'Ein grüner Test ist nur so viel wert wie der Fall, den er prüft.',
	tone: 'crimson',
	art: {
		src: '/art/essay-tutor.webp',
		alt: 'Person an einem Röhrenmonitor am Rand einer großen orangefarbenen Fläche',
		tile: 'essay-tutor',
		position: '100% 100%'
	},
	next: { kind: 'uebung', taskId: 'a-bp-ki-backward-pruefen' },
	figure: {
		kind: 'product',
		after: 'maschine-auftakt-p1',
		title: 'Interaktiver Rechengraph für a · b: Produktregel gegen vertauschten KI-Code',
		caption:
			'Verändere a und b. Bei gleichen Faktoren wie 3 · 3 liefern Produktregel und vertauschter Code dieselben Gradienten. Zwei verschiedene Zahlen machen den Fehler sichtbar.'
	},
	inlineImages: [
		{
			after: 'maschine-frage-p1',
			motif: 'tutorial-schalttafel',
			caption:
				'Routinearbeit wie das Einlesen einer Datei lässt sich auslagern, die eigentliche Kernrechnung des Kurses nicht.'
		},
		{
			after: 'maschine-pruefer-p1',
			motif: 'home-delegieren',
			caption:
				'Eine starre Filterregel greift entweder zu früh in den eigenen Denkfluss ein oder übersieht echte Blockaden.'
		}
	],
	sections: [
		section(
			'maschine-auftakt',
			{
				kind: 'opening',
				facts: facts([
					{ label: 'Test mit x · x', value: 'grün' },
					{ label: 'Gradient a', value: '2 statt −3' },
					{ label: 'Abweichung', value: 'bis 5' }
				])
			},
			'Die Tests sind grün. Sara hat sich von einem Sprachmodell die Rückwärtsrechnung ihrer kleinen Autodiff-Engine schreiben lassen: Kursmodul drei, Klasse `Value`. Der Code sieht aus wie aus dem Lehrbuch. Er hat Kommentare, Typen und einen Satz zur Produktregel. Ihr Test prüft `x * x` an der Stelle 3 und erwartet 6. Er bekommt 6.',
			cited(
				'Dann probiert sie `a * b` mit a = 2 und b = −3. Richtig wären die Gradienten −3 für a und 2 für b. Der Code liefert 2 und −3. Er schreibt jedem Faktor seinen eigenen Wert zu statt den des anderen. Bei `x * x` fällt das nicht auf, weil beide Faktoren dieselbe Zahl sind. Die Abweichung beträgt bis zu 5. In jedem Netz, das auf dieser Engine trainiert, wäre sie still mitgelaufen.',
				'aufgabe-ki-backward'
			)
		),
		section(
			'maschine-frage',
			{ heading: 'Nicht ob ausgelagert wird, sondern was' },
			'Die Debatte über KI an Hochschulen kreist meist um eine Ja-Nein-Frage: erlaubt oder verboten. Saras Fall zeigt, warum die Frage schief steht. Das Modell hat ihr nicht geschadet, weil es Code geschrieben hat. Es hat ihr geschadet, weil es genau die Arbeit übernommen hat, die der Kurs ihr beibringen sollte, die lokale Ableitung. Und weil sie den Fehler mit ihren Mitteln noch nicht finden konnte.',
			cited(
				'Die Kognitionspsychologie nennt das Cognitive Offloading, das Auslagern von Denkarbeit an Werkzeuge (Risko & Gilbert, 2016). Offloading ist nicht verwerflich. Niemand rechnet mehr schriftlich, niemand merkt sich Telefonnummern. Entscheidend ist, welche Arbeit man abgibt und ob man sie danach noch prüfen kann.',
				'risko-gilbert-2016'
			)
		),
		section(
			'maschine-grenze',
			{ heading: 'Eine Grenze, die mit dem Lernziel wandert' },
			cited(
				'Das Kurspaket zieht diese Grenze am Projekt, nicht am Werkzeug. Im Halbmond-Projekt des sechsten Moduls trainieren Studierende ein kleines Netz auf zweidimensionalen Punkten. CSV einlesen und den Plot zeichnen darf das Modell übernehmen, mit einer Prüfung, ob die Daten stimmen. Lokale Ableitungen, Update-Schritt, Gradiententest und die Regel, wie Daten in Training, Validierung und Test aufgeteilt werden, bleiben bei den Studierenden. Genau diese Tätigkeiten soll der Kurs vermitteln.',
				'aufgabe-delegation'
			),
			'Die Grenze ist nicht fest. Wer die eigene Engine gebaut und mit einem selbst geschriebenen Gradiententest geprüft hat, darf sie später durch PyTorch ersetzen. Die Bibliothek tritt dann gegen das eigene Prüfwerkzeug an. Delegation wird so etwas, das man sich erarbeitet.'
		),
		section(
			'maschine-pruefer',
			{ heading: 'Wann eingreifen und wann schweigen' },
			'Hier liegt der praktische Haken. Ein Tutor, der Delegationsgrenzen einhalten soll, braucht ein Modell, das Züge vorschlägt, und Regeln, die sie freigeben oder blockieren. Schon in kleinen Tests mit Qwen3.5-9B gingen je nach Prompt nur 4 beziehungsweise 8 von 13 Vorschlägen durch – einmal blockierte der Filter sogar das Angebot einer Pause.',
			'Starre Regeln schießen schnell über ihr Ziel hinaus. Sinnvoller als ein blinder Filter ist eine klare Absprache im Kurs: Lehrende und Studierende legen gemeinsam fest, welche Schritte man auslagern darf und welche nicht.',
			cited(
				'In der Forschungsliteratur trennt etwa DICE die Entscheidung zum Eingreifen von der Wahl der Rückmeldung. Entscheidend sind zwei Fehlerarten: Fehlalarme mitten im eigenen Fortschritt und verpasste Hilfe bei echten Blockaden. Ob daraus beim Programmieren mehr selbstständiger Transfer entsteht, entscheidet erst ein eigener Kursversuch.',
				'dice-eingriff'
			),
			cited(
				'Manches gehört ohnehin nicht in den Chat. Erst allein vorhersagen, dann mit Peers begründen und danach erneut allein abstimmen funktioniert im Hörsaal. Smith und Kolleg:innen (2009) beobachteten danach bessere Antworten auf eine neue Konzeptfrage, auch wenn in der Diskussionsgruppe zunächst niemand richtig lag.',
				'smith-2009'
			)
		),
		section(
			'maschine-sara',
			{ heading: 'Erst der eigene Prüfstand erlaubt die Abkürzung' },
			'Sara hat an diesem Abend zwei Dinge gelernt. Wie die Produktregel im Rückwärtslauf aussieht. Und dass ein grüner Test nur so viel wert ist wie der Fall, den er prüft. Das zweite hätte ihr kein Modell abnehmen können.'
		)
	],
	sources: [
		study('riskoGilbert'),
		study('dice'),
		essaySource('smith-2009', {
			label: 'Smith et al. 2009 · Why peer discussion improves student performance',
			href: 'https://doi.org/10.1126/science.1165919'
		}),
		essaySource(
			'aufgabe-ki-backward',
			repoSource(
				'Aufgabe · KI-Backward prüfen',
				'pakete/kurse/ki-selbst-bauen/aufgaben/a-bp-ki-backward-pruefen.yaml'
			)
		),
		essaySource(
			'aufgabe-delegation',
			repoSource(
				'Aufgabe · Delegation entscheiden',
				'pakete/kurse/ki-selbst-bauen/aufgaben/a-m6-delegation-entscheiden.yaml'
			)
		),
		essaySource(
			'soziales-lernen',
			repoSource('Soziales Lernen und Motivation', 'research/soziales-lernen-motivation.md')
		)
	],
	evidenceById: {
		'aufgabe-ki-backward': {
			sourceId: 'aufgabe-ki-backward',
			claim: 'Richtig wären die Gradienten −3 für a und 2 für b. Der Code liefert 2 und −3.',
			status: 'complete'
		},
		'risko-gilbert-2016': {
			sourceId: 'riskoGilbert',
			claim:
				'Die Kognitionspsychologie nennt das Cognitive Offloading, das Auslagern von Denkarbeit an Werkzeuge.',
			status: 'complete'
		},
		'aufgabe-delegation': {
			sourceId: 'aufgabe-delegation',
			claim:
				'CSV einlesen und den Plot zeichnen darf das Modell übernehmen, mit einer Prüfung, ob die Daten stimmen.',
			status: 'complete'
		},
		'dice-eingriff': {
			sourceId: 'dice',
			claim: 'DICE trennt die Entscheidung zum Eingreifen von der Wahl der Rückmeldung.',
			limitations:
				'Ob daraus beim Programmieren mehr selbstständiger Transfer entsteht, entscheidet erst ein eigener Kursversuch.',
			status: 'complete'
		},
		'smith-2009': {
			sourceId: 'smith-2009',
			claim:
				'Smith und Kolleg:innen (2009) beobachteten danach bessere Antworten auf eine neue Konzeptfrage.',
			status: 'complete'
		}
	}
};

const articleKalibrierung: EditorialArticle = {
	id: 'wie-sicher-sind-sie',
	kicker: 'Kalibrierung',
	title: 'Wie sicher bist du dir bei dieser Antwort?',
	question: 'Wie prüfst du, ob deine Sicherheit stimmt?',
	teaser: 'Wie gut deine Zuversicht zur Trefferquote passt.',
	deck: 'Ein Klassifikator meldet 99,995 Prozent, eine Studentin tippt auf „ganz sicher“. Beides sind vorerst bloße Behauptungen. Wie man bei Maschinen und Menschen prüft, ob große Zuversicht tatsächlich trägt.',
	editorialStyle: 'economist',
	readingMinutes: 5,
	pullQuote: 'Flüssigkeit fühlt sich an wie Verstehen.',
	tone: 'ink',
	art: {
		src: '/art/essay-transformer.webp',
		alt: 'Kleine Figur am Fuß einer hellen, durchbrochenen Kuppel vor schwarzem Grund',
		tile: 'essay-transformer',
		position: '50% 50%'
	},
	next: { kind: 'magazin', id: 'zwoelf-stunden-bis-zur-statistik' },
	figure: {
		kind: 'softmax',
		after: 'sicher-auftakt-p1',
		title: 'Gleiche Rangfolge, andere Schärfe: Softmax von [2, 1, 0] bis [20, 10, 0]',
		caption:
			'Zieh am Skalierungsfaktor: Die Reihenfolge der drei Klassen bleibt überall gleich, doch der größte Balken wächst von rund 67 auf 99,995 Prozent.'
	},
	inlineImages: [
		{
			after: 'sicher-hypothese-p1',
			motif: 'tutorial-schichten',
			caption:
				'Eine niedrige Sampling-Temperatur wiederholt dieselbe Antwort häufiger. Wahrer wird sie dadurch nicht.'
		},
		{
			after: 'sicher-menschen-p2',
			motif: 'whiteboard',
			caption:
				'Erst der Versuch, einen vertrauten Mechanismus lückenlos selbst zu erklären, legt die Lücken im eigenen Verständnis frei.'
		}
	],
	sections: [
		section(
			'sicher-auftakt',
			{
				kind: 'opening',
				facts: facts([
					{ label: 'Logits 2, 1, 0', value: '67 %' },
					{ label: 'Logits 20, 10, 0', value: '99,995 %' },
					{ label: 'Selbsturteil', value: 'r = 0,29' }
				])
			},
			cited(
				'Drei Balken, verdeckt. Darunter stehen die Logits eines kleinen Klassifikators: 2, 1 und 0. Bevor die Balken erscheinen, verlangt die Übung eine Zahl. Wie hoch ist der größte Balken, und wie sicher bist du dir?',
				'aufgabe-softmax'
			),
			cited(
				'Die Softmax-Funktion macht aus 2, 1, 0 rund 67, 24 und 9 Prozent. Verzehnfacht man die Logits auf 20, 10, 0, erhält die erste Klasse 99,995 Prozent. Die Rangfolge bleibt dieselbe. Das Modell klingt nur sehr viel entschiedener.',
				'aufgabe-softmax-werte'
			)
		),
		section(
			'sicher-hypothese',
			{ heading: 'Sicherheit ist eine Hypothese' },
			cited(
				'Ob 99,995 Prozent etwas bedeuten, lässt sich an einer einzelnen Vorhersage nicht ablesen. Man muss zählen. Sind von allen Fällen, denen das Modell rund 95 Prozent gibt, auch rund 95 Prozent richtig? Erst dann heißt es kalibriert. Guo und Kolleg:innen zeigten 2017, dass moderne neuronale Netze diese Probe oft nicht bestehen. Sie sind systematisch zu zuversichtlich. Ihr Gegenmittel, das nachträgliche Temperature Scaling, teilt alle Logits durch einen einzigen Wert. Er wird auf separaten Daten so gewählt, dass Zuversicht und Trefferquote zusammenpassen.',
				'guo-2017'
			),
			'Hier lauert eine Verwechslung, die in Kursen regelmäßig auftaucht. Auch beim Erzeugen von Text gibt es eine Temperatur. Sie formt die Ziehverteilung: höher heißt flacher und vielfältiger. Mit Wahrheit hat sie nichts zu tun. Eine niedrige Sampling-Temperatur macht eine erfundene Literaturangabe nicht wahrer. Sie macht nur wahrscheinlicher, dass immer wieder dieselbe erscheint.'
		),
		section(
			'sicher-menschen',
			{ heading: 'Warum glatte Erklärungen Verstehen vortäuschen' },
			cited(
				'Bei Menschen ist der Befund kaum ermutigender. Zell und Krizan fassten 2014 22 Metaanalysen zusammen. Selbsteinschätzung und gemessene Leistung korrelieren im Mittel mit r = 0,29. Das ist mehr als nichts und weniger, als man hofft. Die Korrelation sagt dabei nur, ob Bessere sich auch besser einschätzen. Ob sich alle im Schnitt über- oder unterschätzen, sagt sie nicht.',
				'zell-krizan-2014'
			),
			cited(
				'Zwei weitere Befunde sind für Lernsysteme unangenehm. Rozenblit und Keil (2002) ließen Menschen einschätzen, wie gut sie etwa einen Reißverschluss verstehen, und dann den Mechanismus erklären. Nach dem Erklären sank das Urteil häufig. Carpenter und Kolleg:innen (2013) zeigten eine Lerneinheit mit souveränem und mit stockendem Vortrag. Die souveräne Fassung weckte höhere Erwartungen an das eigene Lernen. Im Test war davon nichts zu sehen.',
				'rozenblit-keil-2002',
				'carpenter-2013'
			),
			'Flüssigkeit fühlt sich an wie Verstehen. Ein Tutor, der glatt erklärt, kann dieses Gefühl verstärken, ohne dass mehr Verstehen entsteht.'
		),
		section(
			'sicher-oberflaeche',
			{ heading: 'Zwei Urteile, die sich widersprechen dürfen' },
			'Für ein Lernsystem folgt daraus eine bescheidene Regel. Sicherheit wird abgefragt, bevor die Lösung sichtbar ist, und später mit der tatsächlichen Trefferquote ähnlicher Aufgaben verglichen. Bei wenigen Versuchen zeigt das System Einzelbelege statt einer Quote. Drei Treffer sind keine Statistik.',
			'Sinnvoll sind deshalb zwei Einträge nebeneinander, die sich widersprechen dürfen: „sitzt sicher“ als eigene Einschätzung und „mit Hinweis gelöst“ als letzter Beleg. Wer mag, prüft den Beleg oder probiert direkt eine neue Aufgabe ohne Hilfe. Das macht Überschätzung sichtbar – und genauso unterschätztes Können.',
			'Weder das Modell noch die Studentin hat mit ihrer Zahl recht oder unrecht, solange niemand nachzählt. Gewissheit ist eine Hypothese. Über sie entscheiden erst die Daten.'
		)
	],
	sources: [
		study('guo'),
		study('zellKrizan'),
		essaySource('rozenblit-keil-2002', {
			label: 'Rozenblit & Keil 2002 · The illusion of explanatory depth',
			href: 'https://doi.org/10.1207/s15516709cog2605_1'
		}),
		essaySource('carpenter-2013', {
			label: 'Carpenter et al. 2013 · Appearances can be deceiving',
			href: 'https://doi.org/10.3758/s13423-013-0442-z'
		}),
		essaySource(
			'aufgabe-softmax',
			repoSource(
				'Aufgabe · Softmax und Kreuzentropie',
				'pakete/kurse/ki-selbst-bauen/aufgaben/a-m5-softmax-kreuzentropie.yaml'
			)
		),
		essaySource(
			'recherche-selbsteinschaetzung',
			repoSource('Recherche · Selbsteinschätzung', 'research/selbsteinschaetzung.md')
		)
	],
	evidenceById: {
		'aufgabe-softmax': {
			sourceId: 'aufgabe-softmax',
			claim: 'Bevor die Balken erscheinen, verlangt die Übung eine Zahl.',
			status: 'complete'
		},
		'aufgabe-softmax-werte': {
			sourceId: 'aufgabe-softmax',
			claim:
				'Die Softmax-Funktion macht aus 2, 1, 0 rund 67, 24 und 9 Prozent. Verzehnfacht man die Logits auf 20, 10, 0, erhält die erste Klasse 99,995 Prozent.',
			status: 'complete'
		},
		'guo-2017': {
			sourceId: 'guo',
			claim:
				'Guo und Kolleg:innen zeigten 2017, dass moderne neuronale Netze diese Probe oft nicht bestehen.',
			status: 'complete'
		},
		'zell-krizan-2014': {
			sourceId: 'zellKrizan',
			claim: 'Selbsteinschätzung und gemessene Leistung korrelieren im Mittel mit r = 0,29.',
			limitations: 'Ob sich alle im Schnitt über- oder unterschätzen, sagt sie nicht.',
			status: 'complete'
		},
		'rozenblit-keil-2002': {
			sourceId: 'rozenblit-keil-2002',
			claim: 'Nach dem Erklären sank das Urteil häufig.',
			status: 'complete'
		},
		'carpenter-2013': {
			sourceId: 'carpenter-2013',
			claim:
				'Die souveräne Fassung weckte höhere Erwartungen an das eigene Lernen. Im Test war davon nichts zu sehen.',
			status: 'complete'
		}
	}
};

/** The essays in the Hermes schema, in the order of the issue. */
export const articles: readonly EditorialArticle[] = [
	articleLernstand,
	articleDelegation,
	articleKalibrierung
];

/**
 * The former shape of an essay (one Markdown block per section), derived from the Hermes article
 * so both read the same words. Kept for every consumer of `essays`.
 */
export function toEditorialEssay(article: EditorialArticle): EditorialEssay {
	return {
		id: article.id,
		kicker: article.kicker,
		title: article.title,
		question: article.question,
		teaser: article.teaser,
		deck: article.deck,
		editorialStyle: article.editorialStyle,
		readingMinutes: article.readingMinutes,
		pullQuote: article.pullQuote,
		art: article.art,
		sections: article.sections.map((item) => ({
			...(item.heading ? { heading: item.heading } : {}),
			markdown: paragraphs(...item.paragraphs.map((paragraph) => paragraph.text))
		})),
		sources: article.sources.map(({ label, href }) => ({ label, href }))
	};
}

export const essays: readonly EditorialEssay[] = articles.map(toEditorialEssay);

/** Evidence of an article that the schema marks as an extraction gap. */
export function evidenceGaps(article: HermesEssay): readonly Evidence[] {
	return Object.values(article.evidenceById).filter((item) => item.status === 'limitation');
}

const episodeGrueneLampe: EditorialEpisode = {
	id: 'die-gruene-lampe-luegt',
	kicker: 'Folge 1 · Prüfen',
	title: 'Die grüne Lampe lügt',
	question: 'Warum bleibt der Test mit x · x grün?',
	teaser: 'Wie Gegenfälle einen Fehler im KI-Code aufdecken.',
	deck: 'Ein Test ist grün, der Code ist falsch. Eine Folge über Produktregel, Gegenfälle und die Frage, wann ein Hinweis das Denken anstößt und wann er es übernimmt.',
	durationSeconds: 1_200,
	tone: 'white',
	art: {
		src: '/art/podcast.webp',
		alt: 'Vier schwarze Tonbandspulen in einer Reihe auf weißem Grund',
		tile: 'podcast',
		position: '50% 100%'
	},
	keyPoints: [
		'Ein Test mit x · x kann eine vertauschte Produktregel nicht entdecken, weil beide Faktoren gleich sind.',
		'Ein selbst gebauter numerischer Gradiententest trennt die richtige von der falschen Implementierung.',
		'Ein guter Hinweis benennt, was zu sehen ist, und gibt den Stift zurück.',
		'Dieselbe Kettenregel trägt vom Rechengraphen bis zum Endpreis im Onlineshop.'
	],
	segments: [
		{
			title: 'Ein grüner Test',
			startSeconds: 0,
			script: paragraphs(
				'Moderation: Es ist kurz vor Mitternacht, und auf Saras Bildschirm steht ein grünes Häkchen. Ihr Sprachmodell hat ihr die Rückwärtsrechnung für eine Multiplikation geschrieben. Es erklärt dazu freundlich: „Hier wende ich die Produktregel an.“',
				'Moderation: Der Test, den Sara geschrieben hat, prüft x mal x an der Stelle drei. Erwartet: sechs. Ergebnis: sechs. Sie klappt den Laptop zu.'
			)
		},
		{
			title: 'Die Probe mit sich selbst',
			startSeconds: 95,
			listenerPrompt:
				'Rechne kurz mit: Welche Ableitung hat x · x an der Stelle 3? Sag die Zahl laut, bevor es weitergeht.',
			pauseSeconds: 5,
			script: paragraphs(
				'Moderation: Wenn du sechs gesagt hast, hast du recht. Das Modell auch, zumindest in diesem Fall.',
				'Moderation: Und genau das ist das Problem. Bei x mal x sind beide Faktoren dieselbe Zahl. Ob der Code jedem Faktor den eigenen Wert oder den des anderen zuschreibt, kann dieser Test gar nicht sehen.'
			)
		},
		{
			title: 'Zwei verschiedene Zahlen',
			startSeconds: 240,
			listenerPrompt:
				'Jetzt a · b mit a = 2 und b = −3. Wenn nur a ein kleines Stück größer wird, wird das Produkt größer oder kleiner?',
			pauseSeconds: 8,
			script: paragraphs(
				'Moderation: Kleiner. Wenn a von 2 auf 2,1 wächst, wird aus −6 nämlich −6,3. Der Gradient für a muss also negativ sein, genau −3, der Wert von b.',
				'Moderation: Saras Code liefert für a aber plus 2. Das Vorzeichen allein verrät den Fehler, bevor man irgendetwas ausrechnet. Die richtige Antwort lautet −3 für a und 2 für b. Der Code gibt 2 und −3 zurück. Größte Abweichung: fünf.'
			)
		},
		{
			title: 'Der eigene Prüfstand',
			startSeconds: 420,
			script: paragraphs(
				'Moderation: Wie hätte Sara das selbst finden können, ohne die richtige Lösung schon zu kennen? Mit einem Werkzeug, das sie im Kurs selbst baut. Man schiebt a um ein winziges h nach oben und nach unten, misst den Unterschied im Ergebnis und teilt durch 2h. Im Kurs ist h ein Millionstel.',
				'Moderation: Diese zentrale Differenz liefert für a ungefähr −3. Der Code behauptet 2. Damit ist der Fall entschieden, und zwar durch eine Probe, die Sara selbst versteht.',
				'Moderation: Eine Warnung gehört dazu. Ein noch kleineres h ist nicht automatisch genauer. Wer zwei fast gleiche Zahlen voneinander abzieht, verstärkt Rundungsfehler. Irgendwann misst der Test vor allem die Grenzen der Gleitkommazahlen.'
			)
		},
		{
			title: 'Gespräch: Hinweis oder Übernahme?',
			startSeconds: 600,
			script: paragraphs(
				'Moderation: Woran erkennt man als Lehrperson, ob ein Hinweis die Denkarbeit anstößt oder sie schon übernimmt?',
				'Tutorin: Ich frage mich, was danach noch für die Studentin zu tun bleibt. Wenn ich sage „Schau dir den Gradienten von a an“, bleibt die ganze Rechnung bei ihr. Wenn ich sage „Da muss b hin statt a“, bleibt nichts mehr übrig.',
				'Moderation: Und wenn sie nach dem ersten Hinweis immer noch feststeckt?',
				'Tutorin: Dann werde ich konkreter, aber in Stufen. Erst zeige ich, wo ich hinschauen würde. Dann frage ich nach einem Fall mit zwei verschiedenen Zahlen. Erst ganz am Ende rechne ich ein Parallelbeispiel mit anderen Werten vor. Die eigentliche Aufgabe bleibt bei ihr.',
				'Moderation: Klingt langsam.',
				'Tutorin: Ist es auch. Aber am nächsten Tag weiß sie noch, warum die Lampe grün war.'
			)
		},
		{
			title: 'Den Stift zurückgeben',
			startSeconds: 840,
			script: paragraphs(
				'Moderation: Ein zweiter Ton. Ein Student erklärt seine Skizze eines Rechengraphen. Die Tutorin unterbricht nicht mit der Lösung. Sie sagt nur: „Von d gehen bei dir zwei Pfeile zu L ab. Was trägt jeder davon bei?“ Dann gibt sie den Stift zurück.',
				'Moderation: Die Forschung zum Zeichnen beim Lernen ist ermutigend, aber begrenzt. Schwamborn und Kolleg:innen fanden 2010 bei einem Chemietext mit Teilvorgaben einen Zusammenhang von r = 0,57 zwischen der Qualität der Zeichnungen und späteren Transferleistungen. Das belegt keinen allgemeinen Zeichenbonus. Und es sagt nichts darüber, ob eine Maschine Skizzen zuverlässig lesen kann.'
			)
		},
		{
			title: 'Transfer: der Preis im Shop',
			startSeconds: 1_020,
			listenerPrompt:
				'Ein Artikel kostet im Einkauf 40 €. Darauf kommen 50 % Aufschlag, 5 € Versand und 19 % Mehrwertsteuer. Wie stark steigt der Endpreis, wenn der Aufschlag um einen Prozentpunkt steigt?',
			pauseSeconds: 15,
			script: paragraphs(
				'Moderation: Der Endpreis liegt bei 77,35 €. Ein Prozentpunkt mehr Aufschlag erhöht ihn um 0,476 €, also knapp 48 Cent. Der Rechenweg ist derselbe wie in Saras Engine: Man geht den Graphen vom Ergebnis rückwärts und multipliziert die lokalen Steigungen. Hier sind das 40 € Einkauf mal 1,19 Steuerfaktor.',
				'Moderation: Wer das ohne Hilfe herausbekommt, hat mehr gelernt als die Produktregel. Er hat gelernt, einer grünen Lampe nicht blind zu glauben.'
			)
		}
	],
	sources: [
		{
			label: 'Schwamborn et al. 2010 · Drawing as a generative activity',
			href: 'https://doi.org/10.1037/a0019640'
		},
		repoSource(
			'Aufgabe · KI-Backward prüfen',
			'pakete/kurse/ki-selbst-bauen/aufgaben/a-bp-ki-backward-pruefen.yaml'
		),
		repoSource(
			'Aufgabe · Preiskette',
			'pakete/kurse/ki-selbst-bauen/aufgaben/a-bp-preiskette-transfer.yaml'
		),
		repoSource(
			'Recherche · Zeichnen und Visualisieren',
			'research/zeichnen-visualisieren-lernen.md'
		)
	]
};

const episodeStatistik: EditorialEpisode = {
	id: 'zwoelf-stunden-bis-zur-statistik',
	kicker: 'Folge 2 · Üben',
	title: 'Zwölf Stunden bis zur Statistik',
	question: 'Wie bringen dieselben zwölf Stunden mehr?',
	teaser: 'Warum Abrufen mehr bringt als Markieren.',
	deck: 'Mia hat drei Wochen bis zur Klausur und zwölf Stunden Zeit. Eine Folge darüber, warum sich Markieren produktiv anfühlt, was Abrufen anders macht und wann eine Hürde beim Lernen hilft.',
	durationSeconds: 1_140,
	tone: 'crimson',
	art: {
		src: '/art/hero-collage-orange.webp',
		alt: 'Orangefarbene Scheibe über einem alten Synthesizer-Pult in Druckgrafik',
		position: '50% 50%'
	},
	keyPoints: [
		'Wiedererkennen ist nicht Abrufen: Nach dem dritten Lesen wirkt der Stoff vertraut, ohne dass er frei verfügbar ist.',
		'Abrufübung und verteiltes Üben schneiden im späteren Test besser ab als wiederholtes Lesen.',
		'Gemischtes Üben hilft vor allem, ähnlich klingende Aufgaben zu unterscheiden. Der Effekt hängt vom Material ab.',
		'Produktiv ist eine Hürde, wenn sie genau die Tätigkeit verlangt, die geübt werden soll.'
	],
	segments: [
		{
			title: 'Das gute Gefühl beim Markieren',
			startSeconds: 0,
			script: paragraphs(
				'Moderation: Mia hat einen Plan, und er fühlt sich gut an. Die Statistikklausur ist in drei Wochen. Am Wochenende davor will sie das Skript dreimal lesen und alles Wichtige markieren, sechs Stunden am Samstag, sechs am Sonntag.',
				'Moderation: Nach dem dritten Durchgang ist das Skript gelb, und jede Seite kommt ihr bekannt vor. Genau das ist die Falle. Vertraut heißt nicht verfügbar. In der Klausur liegt kein Skript auf dem Tisch, das sie wiedererkennen könnte.'
			)
		},
		{
			title: 'Drei Aufgaben, die gleich klingen',
			startSeconds: 150,
			listenerPrompt:
				'Welches Verfahren passt jeweils? Erstens: Zehn Mieten, eine davon 4.000 €, gesucht ist eine typische Miete. Zweitens: Wie stark streuen die Klausurnoten um ihren Durchschnitt? Drittens: Wie viel gibt eine WG pro Woche im Schnitt für Lebensmittel aus?',
			pauseSeconds: 12,
			script: paragraphs(
				'Moderation: Erstens Median, weil der Ausreißer den Mittelwert verzerrt. Zweitens Varianz oder Standardabweichung. Drittens Mittelwert.',
				'Moderation: Wer geblockt geübt hat, also zehn Median-Aufgaben am Stück, muss diese Entscheidung nie treffen. Das Verfahren steht in der Kapitelüberschrift. In der Klausur fehlt diese Überschrift.'
			)
		},
		{
			title: 'Was die Forschung über Abrufen weiß',
			startSeconds: 330,
			script: paragraphs(
				'Moderation: Roediger und Karpicke ließen 2006 Studierende einen Text entweder mehrfach lesen oder lesen und dann frei aufschreiben, was sie noch wussten. Fünf Minuten später lag die Lesegruppe vorn. Nach einer Woche hatte sich das Bild gedreht, die Abrufgruppe behielt deutlich mehr.',
				'Moderation: Für verteiltes Üben gibt es eine breite Grundlage. Cepeda und Kolleg:innen haben 2006 Hunderte Vergleiche zusammengefasst. Üben mit Abstand schlägt Üben am Stück, wenn der Test später kommt.',
				'Moderation: Beim gemischten Üben ist das Bild weniger eindeutig. Die Metaanalyse von Brunmair und Richter aus dem Jahr 2019 findet einen Vorteil vor allem dort, wo ähnliche Aufgabentypen auseinandergehalten werden müssen. Bei manchen Materialien verschwindet er. Für Mias Statistik passt er gut. Mittelwert, Median und Varianz klingen ähnlich und verlangen Verschiedenes.'
			)
		},
		{
			title: 'Mias neuer Plan',
			startSeconds: 560,
			script: paragraphs(
				'Moderation: Mia behält ihre zwölf Stunden. Sie teilt sie in sechs Termine zu je zwei Stunden, verteilt auf drei Wochen. Jeder Termin beginnt mit geschlossenem Skript. Sie schreibt auf, was sie noch weiß, und rechnet gemischte Aufgaben. Erst dann schlägt sie nach und bearbeitet die Fehler gezielt noch einmal.',
				'Moderation: Der neue Plan fühlt sich schlechter an. In der ersten Sitzung weiß sie weniger, als sie dachte. Das ist kein Zeichen, dass der Plan schlechter ist. Es ist die erste ehrliche Messung.'
			)
		},
		{
			title: 'Gespräch: Wann wird eine Hürde produktiv?',
			startSeconds: 760,
			script: paragraphs(
				'Moderation: Wann ist eine Hürde beim Lernen nützlich und wann nur lästig?',
				'Lernforscherin: Wenn sie genau die Tätigkeit verlangt, die man können will. Bei Mia ist das, die passende Methode selbst zu erkennen. Eine Aufgabe, die sie dazu zwingt, ist produktive Reibung. Eine App, die sie alle zehn Minuten unterbricht, ist nur Reibung.',
				'Moderation: Man hört oft, man solle erst selbst probieren und sich dann erklären lassen.',
				'Lernforscherin: Das kann helfen. Sinha und Kapur haben 2021 Studien zusammengetragen, in denen ein eigener Versuch vor der Instruktion das konzeptuelle Verständnis gefördert hat. Aber es gibt eine wichtige Grenze. Wer kaum Vorwissen hat, profitiert oft mehr von einem vorgerechneten Beispiel. Danach werden die Hilfen schrittweise abgebaut. Das zeigen Renkl und Atkinson. Kalyuga und Kolleg:innen haben beschrieben, wie sich das mit wachsender Expertise umdreht.',
				'Moderation: Also kommt es darauf an.',
				'Lernforscherin: Es kommt darauf an, wo jemand gerade steht. Genau das sollte ein Tutor herausfinden, bevor er eine Hürde baut.'
			)
		},
		{
			title: 'Der Tag danach',
			startSeconds: 980,
			listenerPrompt:
				'Ohne zurückzuspulen: Welche drei Dinge hat Mia an ihrem Plan geändert, und welches davon kostet keine zusätzliche Minute?',
			pauseSeconds: 15,
			script: paragraphs(
				'Moderation: Sie hat die Zeit verteilt, sie ruft ab, bevor sie liest, und sie mischt die Aufgabentypen. Keine der drei Änderungen kostet zusätzliche Zeit. Alle drei kosten Überwindung.',
				'Moderation: Und gerade hast du selbst etwas getan, das in dieser Folge nur beschrieben wurde. Du hast abgerufen, statt zurückzuspulen. Ob es gewirkt hat, zeigt sich erst morgen. Das ist ein eigener Messpunkt, und er zählt mehr als die letzte Viertelstunde.'
			)
		}
	],
	sources: [
		studies.roedigerKarpicke,
		studies.cepeda,
		studies.brunmairRichter,
		{
			label: 'Sinha & Kapur 2021 · When problem solving followed by instruction works',
			href: 'https://doi.org/10.3102/00346543211019105'
		},
		{
			label: 'Renkl & Atkinson 2003 · Structuring the transition from example study',
			href: 'https://doi.org/10.1207/S15326985EP3801_3'
		},
		{
			label: 'Kalyuga et al. 2003 · The expertise reversal effect',
			href: 'https://doi.org/10.1207/S15326985EP3801_4'
		},
		repoSource(
			'Aufgabe · Lernplan für die Klausur',
			'pakete/kurse/lernen-gestalten/aufgaben/a-lg-lernplan-klausur.yaml'
		)
	]
};

export const podcastEpisodes: readonly EditorialEpisode[] = [episodeGrueneLampe, episodeStatistik];

// Original metadata and editorial notes verified on YouTube on 26 November 2026.
export type YoutubeMagazineEntry = {
	id: string;
	kind: 'youtube';
	category: 'video' | 'podcast';
	videoId: string;
	title: string;
	channel: string;
	channelUrl: string;
	duration: string;
	topicNote: string;
	relatedRoute?: '/erklaerungen' | '/uebungen' | '/tutor' | `/magazin/${string}`;
	thinkPrompt?: string;
};

export const youtubeMagazineEntries: readonly YoutubeMagazineEntry[] = [
	{
		id: 'gradient-descent-3b1b',
		kind: 'youtube',
		category: 'video',
		videoId: 'IHZwWFHWa-w',
		title: 'Wie ein Netz seinen Fehler senkt',
		channel: '3Blue1Brown',
		channelUrl: 'https://www.youtube.com/@3blue1brown',
		duration: '20:33',
		topicNote:
			'Am Beispiel handgeschriebener Ziffern zeigt Grant Sanderson, wie der Gradient die Richtung vorgibt, in der ein Netz seinen Fehler senkt.',
		relatedRoute: '/uebungen',
		thinkPrompt: 'Was passiert, wenn ein Schritt über den tiefsten Punkt hinausschießt?'
	},
	{
		id: 'backpropagation-intuition-3b1b',
		kind: 'youtube',
		category: 'video',
		videoId: 'Ilg3gGewQ5U',
		title: 'Backpropagation im Bild',
		channel: '3Blue1Brown',
		channelUrl: 'https://www.youtube.com/@3blue1brown',
		duration: '12:47',
		topicNote:
			'Die Animation verfolgt den Fehler vom Ausgang zurück und macht sichtbar, wie ein Gewicht über mehrere Pfade zum Ergebnis beiträgt.',
		relatedRoute: '/erklaerungen',
		thinkPrompt:
			'Warum musst du die Beiträge addieren, wenn ein Gewicht den Fehler über zwei Pfade beeinflusst?'
	},
	{
		id: 'backpropagation-kettenregel-3b1b',
		kind: 'youtube',
		category: 'video',
		videoId: 'tIeHLnjs5U8',
		title: 'Backpropagation mit der Kettenregel',
		channel: '3Blue1Brown',
		channelUrl: 'https://www.youtube.com/@3blue1brown',
		duration: '10:18',
		topicNote:
			'Das Video leitet Backpropagation mit der Kettenregel her und liefert damit das Handwerkszeug für den Rechengraphen im Essay.',
		relatedRoute: '/magazin/welche-arbeit-die-maschine-uebernimmt',
		thinkPrompt:
			'Welche Ableitungen multiplizierst du entlang eines Pfads vom Gewicht bis zum Verlust?'
	},
	{
		id: 'transformer-attention-3b1b',
		kind: 'youtube',
		category: 'video',
		videoId: 'eMlx5fFNoYc',
		title: 'Wie Attention Informationen mischt',
		channel: '3Blue1Brown',
		channelUrl: 'https://www.youtube.com/@3blue1brown',
		duration: '26:10',
		topicNote:
			'Die Animation zeigt, wie Query und Key die Gewichte bestimmen, mit denen ein Token Informationen aus den Values anderer Tokens mischt.',
		relatedRoute: '/erklaerungen',
		thinkPrompt:
			'Was ändert sich an der Mischung, wenn ein Key besser zur Query passt und alle Values gleich bleiben?'
	},
	{
		id: 'deepseek-mla-welch-labs',
		kind: 'youtube',
		category: 'video',
		videoId: '0VLAoVGf_74',
		title: 'Wie DeepSeek den Speicherbedarf senkt',
		channel: 'Welch Labs',
		channelUrl: 'https://www.youtube.com/@WelchLabs',
		duration: '18:09',
		topicNote:
			'DeepSeeks Multi-Head Latent Attention vertieft das Attention-Modul am konkreten Beispiel eines komprimierten Key-Value-Caches.',
		relatedRoute: '/erklaerungen',
		thinkPrompt: 'Warum wächst der Key-Value-Cache mit jedem weiteren Token?'
	},
	{
		id: 'grokking-welch-labs',
		kind: 'youtube',
		category: 'video',
		videoId: 'D8GOeCFFby4',
		title: 'Vom Auswendiglernen zur Regel',
		channel: 'Welch Labs',
		channelUrl: 'https://www.youtube.com/@WelchLabs',
		duration: '35:29',
		topicNote:
			'Bei modularer Addition lässt sich beobachten, wie ein kleiner Transformer nach dem Auswendiglernen eine Regel findet, die er auf neue Aufgaben anwenden kann.',
		relatedRoute: '/uebungen',
		thinkPrompt:
			'Welche Kurven für Trainings- und Testfehler würden dich auf Grokking aufmerksam machen?'
	},
	{
		id: 'agententests-legora-latent-space',
		kind: 'youtube',
		category: 'podcast',
		videoId: 'bJBEFzlKPoQ',
		title: 'Wie Legora KI-Agenten testet',
		channel: 'Latent Space',
		channelUrl: 'https://www.youtube.com/@LatentSpacePod',
		duration: '1:07:22',
		topicNote:
			'Legoras nachgebaute Testfälle ohne Zugriff auf vertrauliche Kundendaten liefern ein Praxisbeispiel dafür, wie man die Leistung eines Assistenten unabhängig prüft.',
		relatedRoute: '/magazin/was-von-der-loesung-bleibt',
		thinkPrompt:
			'Welche Testfälle würdest du bauen, um zu prüfen, ob ein Tutor zu früh die Lösung verrät?'
	},
	{
		id: 'mechanistische-interpretierbarkeit-mlst',
		kind: 'youtube',
		category: 'podcast',
		videoId: '_Ygf0GnlwmY',
		title: 'Wie Transformer innen rechnen',
		channel: 'Machine Learning Street Talk',
		channelUrl: 'https://www.youtube.com/@MachineLearningStreetTalk',
		duration: '3:57:44',
		topicNote:
			'Neel Nanda geht von einzelnen Attention-Köpfen zu Schaltkreisen über und fragt, welche Rechenschritte ein Transformer tatsächlich gelernt hat.',
		relatedRoute: '/erklaerungen',
		thinkPrompt:
			'Was müsste sich an der Ausgabe ändern, wenn du einen für die Vorhersage wichtigen Attention-Kopf abschaltest?'
	},
	{
		id: 'lernen-aus-erfahrung-deepmind',
		kind: 'youtube',
		category: 'podcast',
		videoId: 'zzXyPGEtseI',
		title: 'Wie KI aus Selbstspiel lernt',
		channel: 'Google DeepMind',
		channelUrl: 'https://www.youtube.com/@googledeepmind',
		duration: '49:31',
		topicNote:
			'David Silver zeigt an AlphaZero, wie Selbstspiel die Beispiele erzeugt, aus denen das Modell lernt.',
		relatedRoute: '/uebungen',
		thinkPrompt:
			'Was erfährt ein Modell aus einer selbst gespielten Partie, das ihm eine Sammlung fertiger Partien allein kaum zeigt?'
	},
	{
		id: 'effective-agents-ai-engineer',
		kind: 'youtube',
		category: 'video',
		videoId: 'D7_ipDqhtwk',
		title: 'Wann sich KI-Agenten lohnen',
		channel: 'AI Engineer',
		channelUrl: 'https://www.youtube.com/@aiDotEngineer',
		duration: '15:09',
		topicNote:
			'Barry Zhangs Kriterien für den Einsatz von Agenten helfen zu entscheiden, wo ein Tutor einen festen Ablauf braucht und wo er selbst über den nächsten Schritt entscheiden kann.',
		relatedRoute: '/tutor',
		thinkPrompt:
			'Bei welchem Schritt einer Tutor-Sitzung wäre ein fester Ablauf sinnvoller als eine freie Entscheidung des Modells?'
	}
];
