import type { TaskRef, TutorInput } from '../api/types.js';
import type { ScriptedTutorMove, SocraticStep, TutorScenario } from './types.js';

// Flow contract with MockTutorClient: the current step diagnoses the incoming learner turn and
// answers with its prompt unless a diagnosis matches. Quick replies therefore sit on the step
// that will diagnose them, i.e. the step that is current while they are shown.

type QuickReply = NonNullable<SocraticStep['quickReplies']>[number];
type SpokenMove = Extract<ScriptedTutorMove, { text: string }>;
type LabeledTutorScenario = TutorScenario & { shortLabel: string };

const COURSE_VERSION = '0.1.0';

function task(courseId: string, taskId: string): TaskRef {
	return { courseId, courseVersion: COURSE_VERSION, taskId };
}

function message(id: string, text: string): QuickReply {
	return { id, label: text, input: { kind: 'message', text } };
}

function answer(id: string, text: string, confidence?: number): QuickReply {
	const input: TutorInput =
		confidence === undefined ? { kind: 'answer', text } : { kind: 'answer', text, confidence };
	return { id, label: text, input };
}

// Tests the delegation boundary: `explain` yields the parallel example, never the task solution.
const explainDirectly: QuickReply = {
	id: 'direkt-erklaeren',
	label: 'Erklär es direkt',
	input: { kind: 'explain' }
};

const waitForOwnAttempt = {
	id: 'eigenversuch',
	trigger: {
		kind: 'text',
		accepted: ['Moment, ich probiere es aus.', 'Ich rechne kurz.', 'Ich probiere es kurz aus.']
	},
	reply: { move: 'warten' }
} as const;

// ---------------------------------------------------------------------------------------------
// KI selbst bauen · Logits, Softmax und Kreuzentropie als Fehlermaß
// ---------------------------------------------------------------------------------------------

const softmaxAskWhy: SpokenMove = {
	move: 'zurueckerklaeren_lassen',
	text: 'Dann in deinen Worten: Welche Zahl ziehst du in deinem Code von allen Logits ab, damit exp nie überläuft? Und warum ändert das das Ergebnis nicht?'
};

const softmaxScenario: LabeledTutorScenario = {
	id: 'softmax-ueberlauf',
	shortLabel: 'Softmax',
	task: task('ki-selbst-bauen', 'a-m5-softmax-kreuzentropie'),
	title: 'Warum bricht softmax bei 1000 ab?',
	setup:
		'Modul 5. Deine softmax(z) liefert für [2, 1, 0] die erwarteten Werte. Für [1000.0, 0.0] bricht sie mit „OverflowError: math range error“ ab. Danach wartet noch die Schlussfrage: [2, 1, 0] und [20, 10, 0] haben dieselbe Rangfolge. Welches Modell ist „sicherer“, und hat es deshalb öfter recht?',
	delegation: {
		learner: [
			'Die stabile softmax und kreuzentropie selbst schreiben.',
			'Begründen, warum eine gemeinsame Verschiebung aller Logits das Ergebnis nicht ändert.',
			'Die Frage nach Sicherheit und Trefferquote selbst beantworten.'
		],
		tutorMay: [
			'Fehlermeldung und Größenordnungen deuten helfen.',
			'An anderen Zahlen vorrechnen, wie eine Verschiebung im Bruch wirkt.',
			'Die Tests aus der Aufgabe ausführen lassen.'
		]
	},
	parallelExample: {
		move: 'beispiel_zeigen',
		text: 'Ein vorgerechnetes Beispiel an anderen Zahlen: softmax([3, 2]). Zieh 3 ab, das ergibt [0, −1]. e^{0} = 1 und e^{−1} ≈ 0,368, die Summe ist 1,368. Die Anteile sind ≈ 0,731 und 0,269. Ohne Abzug kommt dasselbe heraus, nur mit größeren Zwischenwerten. Deine Funktion und die Begründung schreibst du selbst.'
	},
	whiteboardPrompt: {
		move: 'nachhaken',
		text: 'In deiner Skizze stehen Zähler und Nenner. Wo taucht der gemeinsame Faktor auf, und wo verschwindet er?'
	},
	steps: [
		{
			id: 'einstieg',
			prompt: {
				move: 'nachhaken',
				text: 'Fangen wir bei der Fehlermeldung an. Wie groß ist e hoch 1000 ungefähr, und wie groß darf ein float in Python höchstens werden?'
			},
			quickReplies: [
				message('loesung-bitte', 'Schreib mir die stabile Version einfach hin.'),
				message('overflow-unklar', 'Ich verstehe nicht, warum exp abbricht.'),
				explainDirectly
			],
			diagnoses: [
				{
					id: 'delegation-loesung',
					trigger: { kind: 'contains', phrases: ['einfach hin'] },
					reply: {
						move: 'kurz_erklaeren',
						text: 'Die stabile Version ist genau das, was diese Aufgabe von dir will. Deshalb schreibe ich sie nicht hin. Ich zerlege dir aber den Weg, bis jeder Schritt klein ist. Erster Schritt: Wie groß ist e hoch 1000 ungefähr?'
					}
				}
			],
			nextStepId: 'groessenordnung'
		},
		{
			id: 'groessenordnung',
			prompt: {
				move: 'vorhersage_verlangen',
				text: 'Zum Vergleich: e hoch 1000 hat rund 435 Stellen, ein float endet bei etwa 1,8 · 10³⁰⁸. Daran scheitert exp. Jetzt eine Vorhersage, bevor du etwas ausführst: Was passiert mit softmax([2, 1, 0]), wenn du zu allen drei Logits 100 addierst? Schreib deine Vermutung und wie sicher du bist.'
			},
			quickReplies: [
				answer('riesig', 'Riesig, viel größer als jeder float.'),
				answer('fv-beliebig-gross', 'Python rechnet doch mit beliebig großen Zahlen.')
			],
			diagnoses: [
				{
					id: 'fv-float-unbegrenzt',
					trigger: { kind: 'contains', phrases: ['beliebig'] },
					reply: {
						move: 'kontrastfall',
						text: 'Für ganze Zahlen stimmt das: 10 ** 1000 klappt. math.exp liefert aber einen float. Was erwartest du bei 10.0 ** 1000?'
					},
					nextStepId: 'groessenordnung'
				}
			],
			nextStepId: 'verschiebung'
		},
		{
			id: 'verschiebung',
			prompt: {
				move: 'nachhaken',
				text: 'Prüf deine Vermutung gleich in Python. Vorher die Begründung: Schreib softmax als Bruch und sag in einem Satz, was eine gemeinsame Verschiebung mit Zähler und Nenner macht.'
			},
			quickReplies: [
				answer('gleich', 'Es bleibt gleich.', 70),
				answer('fv-spitzer', 'Die Verteilung wird spitzer, weil die Zahlen größer sind.', 60),
				message('weiss-nicht', 'Keine Ahnung.'),
				message('eigenversuch', 'Moment, ich probiere es aus.')
			],
			diagnoses: [
				waitForOwnAttempt,
				{
					id: 'fv-verschiebung-wie-skalierung',
					trigger: { kind: 'contains', phrases: ['spitzer'] },
					reply: {
						move: 'kontrastfall',
						text: 'Halte zwei Fälle auseinander: [102, 101, 100] und [20, 10, 0]. Im einen sind die Abstände zwischen den Logits gleich geblieben, im anderen nicht. Welcher Fall entspricht deiner Verschiebung?'
					},
					nextStepId: 'verschiebung-hinweis'
				},
				{
					id: 'hinweis-1',
					trigger: { kind: 'contains', phrases: ['keine ahnung'] },
					reply: {
						move: 'gestufter_hinweis',
						text: 'Hinweis 1: Schreib den ersten Anteil als Bruch, e hoch z₁ geteilt durch die Summe aller e hoch z_{j}. Was passiert mit Zähler und Nenner, wenn jedes z um 100 wächst?'
					},
					nextStepId: 'verschiebung-hinweis'
				}
			],
			nextStepId: 'verschiebung-hinweis'
		},
		{
			id: 'verschiebung-hinweis',
			prompt: softmaxAskWhy,
			quickReplies: [
				answer('faktor', 'Zähler und Nenner bekommen beide den Faktor e hoch 100.'),
				message('noch-unklar', 'Ich sehe es noch nicht.')
			],
			diagnoses: [
				{
					id: 'hinweis-2',
					trigger: { kind: 'contains', phrases: ['noch nicht'] },
					reply: {
						move: 'gestufter_hinweis',
						text: 'Hinweis 2: e hoch (z + 100) ist dasselbe wie e hoch z mal e hoch 100. Wenn dieser Faktor oben und unten im Bruch steht, was bleibt übrig?'
					},
					nextStepId: 'verschiebung-hinweis-3'
				}
			],
			nextStepId: 'max-abziehen'
		},
		{
			id: 'verschiebung-hinweis-3',
			prompt: softmaxAskWhy,
			quickReplies: [
				answer('kuerzen', 'Der Faktor kürzt sich weg.'),
				message('immer-noch', 'Ich sehe es immer noch nicht.')
			],
			diagnoses: [
				{
					id: 'hinweis-3',
					trigger: { kind: 'contains', phrases: ['immer noch'] },
					reply: {
						move: 'gestufter_hinweis',
						text: 'Hinweis 3, an anderen Zahlen: Für [1, 0] ist der erste Anteil e / (e + 1) ≈ 0,731. Für [3, 2] ist er e³ / (e³ + e²). Klammere e² aus und vergleiche. Welche Zahl hast du abgezogen, um von [3, 2] nach [1, 0] zu kommen?'
					},
					nextStepId: 'verschiebung-hinweis-3'
				}
			],
			nextStepId: 'max-abziehen'
		},
		{
			id: 'max-abziehen',
			prompt: {
				move: 'transfer_stellen',
				text: 'Jetzt die Schlussfrage der Aufgabe. [2, 1, 0] gibt der ersten Klasse rund 0,67, [20, 10, 0] rund 0,99995. Beide wählen dieselbe Klasse. Welches Modell hat öfter recht?'
			},
			quickReplies: [
				answer(
					'max',
					'Ich ziehe max(z) ab. Dann ist der größte Exponent 0, und das Verhältnis bleibt gleich.'
				),
				answer('fv-mittelwert', 'Ich ziehe den Mittelwert ab, dann werden die Zahlen klein.')
			],
			diagnoses: [
				{
					id: 'fv-mittelwert-reicht',
					trigger: { kind: 'contains', phrases: ['mittelwert'] },
					reply: {
						move: 'kontrastfall',
						text: 'Probier das an [2000, 0]. Der Mittelwert ist 1000. Welcher Exponent bleibt nach dem Abziehen übrig, und läuft exp damit noch über?'
					},
					nextStepId: 'max-abziehen'
				}
			],
			nextStepId: 'kalibrierung'
		},
		{
			id: 'kalibrierung',
			prompt: {
				move: 'nachhaken',
				text: 'Welche Beobachtung bräuchtest du, um einer vorhergesagten 0,95 zu trauen? Beschreib, was du zählen würdest.'
			},
			quickReplies: [
				answer('fv-sicherer', 'Das zweite, es ist sich viel sicherer.', 80),
				answer(
					'nicht-entscheidbar',
					'Das lässt sich an einer einzelnen Vorhersage nicht sagen.',
					60
				)
			],
			diagnoses: [
				{
					id: 'fv-softmax-ist-sicherheit',
					trigger: { kind: 'contains', phrases: ['sicherer'] },
					reply: {
						move: 'kontrastfall',
						text: 'Stell dir 100 Bilder vor, denen das zweite Modell jeweils 0,99995 gibt. 70 davon erkennt es richtig. Was sagt die Zahl 0,99995 dann über dieses Modell?'
					},
					nextStepId: 'kalibrierung-check'
				}
			],
			nextStepId: 'abschluss'
		},
		{
			id: 'kalibrierung-check',
			prompt: {
				move: 'zurueckerklaeren_lassen',
				text: 'Schreib das als Antwort auf die Schlussfrage auf, in zwei Sätzen und mit eigenem Beispiel. Ich lese mit, ändere aber nichts daran.'
			},
			quickReplies: [
				answer('ueberschaetzt', 'Es ist zu selbstsicher. Die Zahl passt nicht zur Trefferquote.')
			],
			nextStepId: 'abschluss'
		},
		{
			id: 'abschluss',
			prompt: {
				move: 'abschliessen',
				text: 'Beide Teile hast du selbst erarbeitet: die Verschiebung um das Maximum und den Unterschied zwischen Sicherheit und Trefferquote. Lass jetzt die Tests der Aufgabe laufen. Morgen kommt eine kurze Abrufkarte dazu, ohne diesen Verlauf.'
			},
			quickReplies: [message('eigenversuch', 'Ich probiere es kurz aus.')],
			diagnoses: [waitForOwnAttempt]
		}
	]
};

// ---------------------------------------------------------------------------------------------
// Python-Einstieg · Schleifenvariable, Name und Listenfach
// ---------------------------------------------------------------------------------------------

const pythonAskBack: SpokenMove = {
	move: 'zurueckerklaeren_lassen',
	text: 'Dann erklär in einem Satz, warum preise nach der ersten Schleife unverändert ist. Und schreib die Korrektur selbst, Python prüft sie danach.'
};

const pythonScenario: LabeledTutorScenario = {
	id: 'schleifenvariable-listenfach',
	shortLabel: 'Python',
	task: task('python-einstieg', 'a-schleifenvariable-vorhersagen'),
	title: 'Warum bleibt die Liste gleich?',
	setup:
		'Woche 2. Du hast vorhergesagt, dass nach `for p in preise: p = p * 2` die Liste [20, 40, 60] enthält. Python gibt [10, 20, 30] aus. Die zweite Schleife mit `neu.append(p * 2)` liefert dagegen [20, 40, 60].',
	delegation: {
		learner: [
			'Bindungen von Namen und Änderungen an Objekten selbst verfolgen.',
			'Die Vorhersage vor dem Ausführen festlegen.',
			'Die Korrektur der Schleife selbst schreiben.'
		],
		tutorMay: [
			'Eine leere Trace-Tabelle geben.',
			'Python die Ausgabe prüfen lassen.',
			'Ein Parallelbeispiel mit anderen Werten durchrechnen.'
		]
	},
	parallelExample: {
		move: 'beispiel_zeigen',
		text: 'Ein durchgerechnetes Beispiel an anderen Werten: zahlen = [1, 2], dann for z in zahlen: z = z + 10. Durchlauf 1: z zeigt auf 1, danach auf 11. zahlen[0] zeigt weiter auf 1. Durchlauf 2: z zeigt auf 2, danach auf 12. Am Ende ist zahlen weiterhin [1, 2]. Deine eigene Schleife verfolgst du selbst.'
	},
	whiteboardPrompt: {
		move: 'nachhaken',
		text: 'In deiner Skizze gehen Pfeile von p und von preise[0] aus. Welcher davon bewegt sich, wenn p = p * 2 läuft?'
	},
	steps: [
		{
			id: 'einstieg',
			prompt: {
				move: 'nachhaken',
				text: 'Gehen wir in den ersten Durchlauf. Worauf zeigt p, bevor p = p * 2 ausgeführt wird, und worauf zeigt preise[0]?'
			},
			quickReplies: [
				message('warum', 'Warum stehen noch 10, 20, 30 in der Liste? Ich habe doch p verdoppelt.'),
				message('fv-fach', 'p ist doch das erste Fach der Liste.'),
				message('loesung-bitte', 'Sag mir einfach, wie ich die Liste verdopple.'),
				explainDirectly
			],
			diagnoses: [
				{
					id: 'fv-schleifenvariable-ist-fach',
					trigger: { kind: 'contains', phrases: ['fach'] },
					reply: {
						move: 'nachhaken',
						text: 'Prüfen wir das. Zeichne zwei Kästchen, eins für preise[0] und eins für p. Worauf zeigt jedes davon im ersten Durchlauf, bevor p = p * 2 läuft?'
					}
				},
				{
					id: 'delegation-loesung',
					trigger: { kind: 'contains', phrases: ['sag mir einfach'] },
					reply: {
						move: 'kurz_erklaeren',
						text: 'Die Korrektur schreibst du selbst, sie ist Teil der Aufgabe. Ich helfe dir zu sehen, warum die erste Schleife nichts ändert. Worauf zeigt p im ersten Durchlauf?'
					}
				}
			],
			nextStepId: 'pfeile'
		},
		{
			id: 'pfeile',
			prompt: {
				move: 'vorhersage_verlangen',
				text: 'Jetzt läuft p = p * 2. Welcher Pfeil ändert sich, der von p oder der von preise[0]? Gib vorher an, wie sicher du bist.'
			},
			quickReplies: [
				answer('beide-zehn', 'Beide zeigen auf die 10.'),
				answer('fv-identisch', 'p ist preise[0].')
			],
			diagnoses: [
				{
					id: 'fv-name-ist-fach',
					trigger: { kind: 'contains', phrases: ['ist preise'] },
					reply: {
						move: 'kontrastfall',
						text: 'Vergleich zwei Zeilen: b = 5, dann a = b, dann b = b + 1. Welchen Wert hat a danach? Wenn du das weißt, weißt du auch, ob p und preise[0] dasselbe Kästchen sind.'
					},
					nextStepId: 'pfeile'
				}
			],
			nextStepId: 'welcher-pfeil'
		},
		{
			id: 'welcher-pfeil',
			prompt: pythonAskBack,
			quickReplies: [
				answer('p-pfeil', 'Nur der Pfeil von p. Er zeigt jetzt auf 20.', 80),
				answer('fv-beide', 'Beide, weil p aus der Liste kommt.', 60),
				message('unsicher', 'Ich bin mir nicht sicher.')
			],
			diagnoses: [
				{
					id: 'fv-zuweisung-aendert-liste',
					trigger: { kind: 'contains', phrases: ['beide'] },
					reply: {
						move: 'gestufter_hinweis',
						text: 'Hinweis 1: Eine Zuweisung mit = bindet den Namen links neu. Steht links preise[0] oder p?'
					},
					nextStepId: 'welcher-pfeil-2'
				},
				{
					id: 'unsicher',
					trigger: { kind: 'contains', phrases: ['nicht sicher'] },
					reply: {
						move: 'gestufter_hinweis',
						text: 'Hinweis 1: Eine Zuweisung mit = bindet den Namen links neu. Steht links preise[0] oder p?'
					},
					nextStepId: 'welcher-pfeil-2'
				}
			],
			nextStepId: 'korrektur'
		},
		{
			id: 'welcher-pfeil-2',
			prompt: pythonAskBack,
			quickReplies: [
				answer('links-p', 'Links steht p.'),
				message('noch-unklar', 'Ich verstehe es noch nicht.')
			],
			diagnoses: [
				{
					id: 'hinweis-2',
					trigger: { kind: 'contains', phrases: ['noch nicht'] },
					reply: {
						move: 'gestufter_hinweis',
						text: 'Hinweis 2: Hier ist eine leere Trace-Tabelle mit den Spalten Durchlauf, p und preise. Trag für den ersten Durchlauf ein, was vor und nach p = p * 2 in jeder Spalte steht.'
					},
					nextStepId: 'welcher-pfeil-3'
				}
			],
			nextStepId: 'korrektur'
		},
		{
			id: 'welcher-pfeil-3',
			prompt: pythonAskBack,
			quickReplies: [
				answer('tabelle', 'p: erst 10, dann 20. preise: vorher und nachher [10, 20, 30].'),
				message('immer-noch', 'Ich verstehe es immer noch nicht.')
			],
			diagnoses: [
				{
					id: 'hinweis-3',
					trigger: { kind: 'contains', phrases: ['immer noch'] },
					reply: {
						move: 'gestufter_hinweis',
						text: "Hinweis 3, an einem anderen Beispiel: namen = ['ada', 'bo'], dann for n in namen: n = n.upper(). Danach ist namen weiterhin ['ada', 'bo'], weil n = … nur n neu bindet. Welcher Name in deinem Code spielt die Rolle von n?"
					},
					nextStepId: 'welcher-pfeil-3'
				}
			],
			nextStepId: 'korrektur'
		},
		{
			id: 'korrektur',
			prompt: {
				move: 'transfer_stellen',
				text: 'Eine neue Lage: sicherung = preise, danach preise.append(40). Was gibt print(sicherung) aus? Sag erst die Ausgabe und wie sicher du bist, dann führ es aus.'
			},
			quickReplies: [
				answer(
					'neue-liste',
					'p bindet nur den Namen neu. Korrektur: neu = [], dann in der Schleife neu.append(p * 2).'
				),
				answer('index', 'for i in range(len(preise)): preise[i] = preise[i] * 2')
			],
			diagnoses: [
				{
					id: 'variante-index',
					trigger: { kind: 'contains', phrases: ['preise[i]'] },
					reply: {
						move: 'nachhaken',
						text: 'Das funktioniert auch, aber anders: Diese Version verändert die Liste selbst, die andere baut eine neue. Welche brauchst du, wenn du die alten Preise später noch vergleichen willst?'
					},
					nextStepId: 'korrektur'
				}
			],
			nextStepId: 'transfer'
		},
		{
			id: 'transfer',
			prompt: {
				move: 'abschliessen',
				text: 'Halte fest, was du heute unterschieden hast: einen Namen neu binden und ein Objekt verändern. Ob deine Vorhersage stimmte, sagt dir das Programm. In zwei Tagen kommt eine Abrufkarte mit einer Variante, ohne diesen Verlauf.'
			},
			quickReplies: [
				answer('mit-vierzig', '[10, 20, 30, 40]', 70),
				answer('fv-kopie', '[10, 20, 30], sicherung ist ja eine Kopie.', 80)
			],
			diagnoses: [
				{
					id: 'fv-zuweisung-kopiert',
					trigger: { kind: 'contains', phrases: ['kopie'] },
					reply: {
						move: 'kontrastfall',
						text: 'Vorhin hat p = p * 2 einen Namen neu gebunden. Jetzt verändert append ein Objekt. Wie viele Listen gibt es nach sicherung = preise, eine oder zwei? Zeichne die Pfeile.'
					},
					nextStepId: 'transfer'
				}
			]
		}
	]
};

// ---------------------------------------------------------------------------------------------
// Lernen und Gestalten · Abrufen statt Wiederlesen
// ---------------------------------------------------------------------------------------------

// The task forbids naming the solution phrases in tutor texts (verbotene_bestandteile).
const learningReveal: SpokenMove = {
	move: 'kurz_erklaeren',
	text: 'So lief es in einem bekannten Experiment (Roediger & Karpicke, 2006): Nach fünf Minuten lag die Lesegruppe vorn, nach einer Woche die Abrufgruppe. Was heißt das für Mias zwölf Stunden? Bau ihren Plan bei gleicher Zeit um und begründe jede Änderung.'
};

const learningScenario: LabeledTutorScenario = {
	id: 'abrufen-statt-wiederlesen',
	shortLabel: 'Lernen',
	task: task('lernen-gestalten', 'a-lg-lernplan-klausur'),
	title: 'Reicht dreimal Lesen?',
	setup:
		'Mia, eine erfundene Studentin, schreibt in drei Wochen eine Statistikklausur. Ihr Plan: am Wochenende davor das Skript dreimal lesen und markieren, sechs Stunden am Samstag, sechs am Sonntag. Du sollst den Plan beurteilen und bei gleicher Zeit verbessern.',
	delegation: {
		learner: [
			'Den Plan beurteilen und jede Änderung begründen.',
			'Vorhersagen zu beiden Zeitpunkten selbst treffen.',
			'Die zwölf Stunden selbst umplanen.'
		],
		tutorMay: [
			'Kalenderblöcke vorschlagen, nachdem der Plan begründet ist.',
			'Aufgabentypen zum Mischen bereitstellen.',
			'Bei einer Wissenslücke ein Beispiel an anderen Zahlen vorrechnen.'
		]
	},
	parallelExample: {
		move: 'beispiel_zeigen',
		text: 'Ein ausgearbeitetes Beispiel aus einem anderen Fach: Ole hat zehn Stunden für eine Vokabelprüfung in vier Wochen. Statt zwei langer Leseabende plant er fünf Termine zu je zwei Stunden. Jeder Termin beginnt damit, die Übersetzungen abzudecken und aufzusagen. Erst danach sieht er nach und übt die Fehler gezielt. Mias Plan baust du selbst um.'
	},
	whiteboardPrompt: {
		move: 'nachhaken',
		text: 'In deiner Skizze stehen die Termine. An welcher Stelle eines Termins holt Mia etwas selbst hervor, und wo liest sie nur?'
	},
	steps: [
		{
			id: 'einstieg',
			prompt: {
				move: 'nachhaken',
				text: 'Bevor wir den Plan bewerten: Was muss Mia in der Klausur mit dem Stoff tun, ihn wiedererkennen oder selbst hervorholen?'
			},
			quickReplies: [
				message('plan-gut', 'Ich finde den Plan gut. Nach dreimal Lesen kennt sie alles.'),
				message('plan-bitte', 'Mach du mir einfach einen besseren Lernplan.'),
				explainDirectly
			],
			diagnoses: [
				{
					id: 'delegation-plan',
					trigger: { kind: 'contains', phrases: ['mach du'] },
					reply: {
						move: 'kurz_erklaeren',
						text: 'Kalenderblöcke schlage ich dir später gern vor. Die Begründung, warum ein Plan besser ist, ist aber die Aufgabe. Erste Frage dazu: Was muss Mia in der Klausur mit dem Stoff tun?'
					}
				},
				{
					id: 'fv-wiederlesen-reicht',
					trigger: { kind: 'contains', phrases: ['kennt'] },
					reply: {
						move: 'nachhaken',
						text: '„Kennt“ ist das entscheidende Wort. Muss Mia in der Klausur eine Formel wiedererkennen, die vor ihr steht, oder sie selbst hervorholen?'
					}
				}
			],
			nextStepId: 'wiedererkennen'
		},
		{
			id: 'wiedererkennen',
			prompt: {
				move: 'vorhersage_verlangen',
				text: 'Dann eine Vorhersage. Zwei Gruppen lernen gleich lange. Gruppe A liest einen Text mehrmals. Gruppe B liest ihn einmal und schreibt danach auf, was sie noch weiß. Wer liegt fünf Minuten später vorn, wer nach einer Woche? Gib zu jedem Urteil an, wie sicher du bist.'
			},
			quickReplies: [
				answer('hervorholen', 'Selbst hervorholen, das Skript liegt ja nicht daneben.'),
				answer('fv-gleichsetzen', 'Wenn sie es wiedererkennt, kann sie es auch abrufen.')
			],
			diagnoses: [
				{
					id: 'fv-wiedererkennen-ist-abrufen',
					trigger: { kind: 'contains', phrases: ['wiedererkennt'] },
					reply: {
						move: 'kontrastfall',
						text: 'Probier es an dir selbst. Welche Schritte für den Median könntest du jetzt aufschreiben, ohne nachzusehen? Schreib sie hin, bevor du weiterliest.'
					},
					nextStepId: 'selbsttest'
				}
			],
			nextStepId: 'vorhersage'
		},
		{
			id: 'selbsttest',
			prompt: {
				move: 'vorhersage_verlangen',
				text: 'Die Stelle, an der du gestockt hast, hätte das dritte Lesen nicht gezeigt. Jetzt eine Vorhersage: Gruppe A liest einen Text mehrmals, Gruppe B liest einmal und schreibt dann auf, was sie noch weiß. Wer liegt nach fünf Minuten vorn, wer nach einer Woche? Mit Sicherheit zu jedem Urteil.'
			},
			quickReplies: [
				answer(
					'median-teilweise',
					'Sortieren, dann die Mitte nehmen. Bei gerader Anzahl weiß ich es nicht mehr.'
				),
				message('gar-nicht', 'Ehrlich gesagt bekomme ich das nicht zusammen.')
			],
			diagnoses: [
				{
					id: 'wissensluecke',
					trigger: { kind: 'contains', phrases: ['nicht zusammen'] },
					reply: {
						move: 'beispiel_zeigen',
						text: 'Dann zuerst ein vorgerechnetes Beispiel an anderen Zahlen: [7, 3, 9, 4]. Sortiert: [3, 4, 7, 9]. Die Anzahl ist gerade, also mittelst du die beiden mittleren Werte 4 und 7. Ergebnis: 5,5. Jetzt du: Was ist der Median von [8, 1, 5, 2]?'
					},
					nextStepId: 'selbsttest'
				}
			],
			nextStepId: 'vorhersage'
		},
		{
			id: 'vorhersage',
			prompt: learningReveal,
			quickReplies: [
				answer('getrennt', 'Nach fünf Minuten Gruppe A, nach einer Woche Gruppe B.', 55),
				answer('fv-lesen-vorn', 'Gruppe A, sie hat den Text öfter gesehen.', 75),
				answer('fv-abruf-immer', 'Gruppe B, und zwar zu beiden Zeitpunkten.', 60)
			],
			diagnoses: [
				{
					id: 'fv-oefter-gesehen',
					trigger: { kind: 'contains', phrases: ['öfter gesehen'] },
					reply: {
						move: 'gestufter_hinweis',
						text: 'Hinweis 1: Trenn die beiden Zeitpunkte. Nach fünf Minuten zählt, was noch frisch vor Augen ist. Nach einer Woche zählt, was man selbst wiederfinden kann. Welche der beiden Tätigkeiten übt dieses Wiederfinden?'
					},
					nextStepId: 'vorhersage-2'
				},
				{
					id: 'fv-abruf-immer-vorn',
					trigger: { kind: 'contains', phrases: ['beiden zeitpunkten'] },
					reply: {
						move: 'kontrastfall',
						text: 'Schau dir die fünf Minuten noch einmal an. Wer hat den Text in diesem Moment frischer vor Augen, die Gruppe, die ihn gerade mehrmals gelesen hat, oder die andere?'
					},
					nextStepId: 'vorhersage-2'
				}
			],
			nextStepId: 'plan'
		},
		{
			id: 'vorhersage-2',
			prompt: learningReveal,
			quickReplies: [
				answer('abruf-woche', 'Nach einer Woche Gruppe B, weil sie das Hervorholen geübt hat.'),
				message('noch-unklar', 'Ich sehe den Unterschied noch nicht.')
			],
			diagnoses: [
				{
					id: 'hinweis-2',
					trigger: { kind: 'contains', phrases: ['noch nicht'] },
					reply: {
						move: 'gestufter_hinweis',
						text: 'Hinweis 2: Denk an eine Telefonnummer, die du oft gesehen, aber nie selbst gewählt hast. Erkennst du sie wieder? Kannst du sie aufsagen? Übertrag das auf die beiden Gruppen.'
					},
					nextStepId: 'vorhersage-3'
				}
			],
			nextStepId: 'plan'
		},
		{
			id: 'vorhersage-3',
			prompt: learningReveal,
			quickReplies: [
				answer('telefon', 'Wiedererkennen ja, aufsagen nein. Gruppe B übt das Aufsagen.'),
				message('immer-noch', 'Ich sehe es immer noch nicht.')
			],
			diagnoses: [
				{
					id: 'hinweis-3',
					trigger: { kind: 'contains', phrases: ['immer noch'] },
					reply: {
						move: 'gestufter_hinweis',
						text: 'Hinweis 3, als Parallelfall: Zwei Personen lernen Vokabeln. Die eine liest die Liste fünfmal. Die andere deckt die Übersetzungen ab und sagt sie dreimal auf. Am nächsten Tag fragt jemand einzelne Wörter ab, ohne Liste. Wer hat geübt, was dann verlangt wird?'
					},
					nextStepId: 'vorhersage-3'
				}
			],
			nextStepId: 'plan'
		},
		{
			id: 'plan',
			prompt: {
				move: 'zurueckerklaeren_lassen',
				text: 'Erklär den neuen Plan jetzt so, als müsstest du Mia überzeugen. Sie findet den alten angenehmer. Warum fühlt er sich besser an, obwohl er weniger bringt?'
			},
			quickReplies: [
				answer(
					'neuer-plan',
					'Sechs Termine zu je zwei Stunden. Jedes Mal erst frei aufschreiben und Aufgaben rechnen, dann nachsehen und Fehler wiederholen.'
				),
				answer('fv-mehr-zeit', 'Sie sollte einfach mehr Stunden einplanen.'),
				answer('fv-am-stueck', 'Lieber alles am Wochenende, dann ist es frisch.')
			],
			diagnoses: [
				{
					id: 'fv-mehr-zeit',
					trigger: { kind: 'contains', phrases: ['mehr stunden'] },
					reply: {
						move: 'nachhaken',
						text: 'Mehr Zeit hilft fast immer, aber die Aufgabe hält zwölf Stunden fest. Was lässt sich an diesen zwölf Stunden ändern, ohne eine Minute dazuzugeben?'
					},
					nextStepId: 'plan'
				},
				{
					id: 'fv-am-stueck-lernen-besser',
					trigger: { kind: 'contains', phrases: ['frisch'] },
					reply: {
						move: 'kontrastfall',
						text: '„Frisch“ war in der Vorhersage der Vorteil nach fünf Minuten. Die Klausur liegt aber nicht fünf Minuten nach dem Lernen. Welcher der beiden Zeitpunkte ähnelt ihr mehr?'
					},
					nextStepId: 'plan'
				}
			],
			nextStepId: 'rueckerklaerung'
		},
		{
			id: 'rueckerklaerung',
			prompt: {
				move: 'transfer_stellen',
				text: 'Letzte Frage, an einem neuen Fall: In der Klausur steht eine Kennzahlen-Aufgabe, die du noch nie gesehen hast. Woran erkennst du, ob Mittelwert, Median oder Varianz gefragt ist? Und wie würdest du genau dieses Erkennen vorher üben?'
			},
			quickReplies: [
				answer(
					'vertraut',
					'Beim Lesen wirkt alles vertraut. Das fühlt sich wie Können an, ist aber nur Wiedererkennen.'
				)
			],
			nextStepId: 'abschluss'
		},
		{
			id: 'abschluss',
			prompt: {
				move: 'abschliessen',
				text: 'Den Plan hast du selbst umgebaut und begründet. Wenn du möchtest, schlage ich dir sechs Kalenderblöcke vor, die Inhalte bestimmst du. Fällt ein Termin aus, verschiebst du ihn einfach. Dabei geht nichts verloren.'
			},
			quickReplies: [
				answer(
					'erkennen-ueben',
					'Am Ausreißer oder an der Frage nach Streuung. Üben würde ich mit gemischten Aufgaben ohne Kapitelüberschrift.'
				)
			]
		}
	]
};

export const tutorScenarios: readonly LabeledTutorScenario[] = [
	softmaxScenario,
	pythonScenario,
	learningScenario
];
