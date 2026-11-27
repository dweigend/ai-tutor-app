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
// Logits, Softmax und Kreuzentropie als Fehlermaß
// ---------------------------------------------------------------------------------------------

const softmaxAskWhy: SpokenMove = {
	move: 'zurueckerklaeren_lassen',
	text: 'Dann in deinen Worten: Welche Zahl ziehst du von allen Logits ab, damit exp nie überläuft – und warum bleibt das Ergebnis gleich?'
};

const softmaxScenario: LabeledTutorScenario = {
	id: 'softmax-ueberlauf',
	shortLabel: 'Softmax',
	task: task('ki-selbst-bauen', 'a-m5-softmax-kreuzentropie'),
	title: 'Warum bricht softmax bei 1000 ab?',
	setup:
		'Deine softmax(z) klappt für [2, 1, 0], bricht aber bei [1000.0, 0.0] mit „OverflowError: math range error“ ab. Danach noch eine Frage: [2, 1, 0] und [20, 10, 0] haben dieselbe Rangfolge – welches Modell ist „sicherer“, und liegt es deshalb öfter richtig?',
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
		text: 'Schau dir andere Zahlen an: softmax([3, 2]). Zieh 3 ab, dann steht da [0, −1]. e^{0} = 1 und e^{−1} ≈ 0,368, zusammen 1,368 – also rund 0,731 und 0,269. Ohne Abzug kommt genau dasselbe raus, nur mit größeren Zwischenwerten. Deine Funktion schreibst du jetzt selbst.'
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
				text: 'Hey du – lass uns bei der Fehlermeldung starten. Wie groß ist e hoch 1000 ungefähr, und bis wohin reicht ein float in Python?'
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
						text: 'Genau diese Funktion baust du hier selbst – deshalb schreibe ich sie nicht hin. Wir gehen es aber Schritt für Schritt durch: Wie groß ist e hoch 1000 ungefähr?'
					}
				}
			],
			nextStepId: 'groessenordnung'
		},
		{
			id: 'groessenordnung',
			prompt: {
				move: 'vorhersage_verlangen',
				text: 'e hoch 1000 hat rund 435 Stellen, ein float endet schon bei etwa 1,8 · 10³⁰⁸ – deshalb bricht exp ab. Was tippst du ohne Ausführen: Was passiert mit softmax([2, 1, 0]), wenn du auf alle drei Logits 100 draufrechnest?'
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
						text: 'Für ganze Zahlen stimmt das: 10 ** 1000 klappt. math.exp gibt aber einen float zurück. Was passiert bei 10.0 ** 1000?'
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
				text: 'Probier’s gleich in Python aus. Vorher kurz die Idee: Schreib softmax als Bruch – was passiert mit Zähler und Nenner, wenn du überall dieselbe Zahl addierst?'
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
						text: 'Vergleich mal [102, 101, 100] und [20, 10, 0]: Einmal bleiben die Abstände gleich, einmal wachsen sie. Welcher Fall passt zu +100?'
					},
					nextStepId: 'verschiebung-hinweis'
				},
				{
					id: 'hinweis-1',
					trigger: { kind: 'contains', phrases: ['keine ahnung'] },
					reply: {
						move: 'gestufter_hinweis',
						text: 'Kein Problem: Schreib den ersten Anteil als Bruch, e hoch z₁ durch die Summe aller e hoch z_{j}. Was ändert sich oben und unten, wenn jedes z um 100 wächst?'
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
						text: 'e hoch (z + 100) ist e hoch z mal e hoch 100. Wenn derselbe Faktor oben und unten steht – was passiert mit ihm?'
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
						text: 'Rechne es klein durch: Bei [1, 0] ist der erste Anteil e / (e + 1) ≈ 0,731. Bei [3, 2] steht e³ / (e³ + e²). Klammere e² aus – welche Zahl hast du abgezogen, um von [3, 2] auf [1, 0] zu kommen?'
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
				text: 'Alles klar. Jetzt zur zweiten Frage: [2, 1, 0] gibt der ersten Klasse rund 0,67, [20, 10, 0] rund 0,99995. Beide wählen Klasse 1. Welches Modell liegt öfter richtig?'
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
						text: 'Teste das mal an [2000, 0]: Der Mittelwert ist 1000. Welcher Exponent bleibt übrig – und läuft exp damit immer noch über?'
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
				text: 'Woran würdest du prüfen, ob eine gemeldete 0,95 wirklich stimmt? Was müsstest du nachzählen?'
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
						text: 'Stell dir 100 Bilder vor, bei denen das Modell jedes Mal 0,99995 meldet – aber nur 70 stimmen. Was heißt die 0,99995 dann?'
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
				text: 'Fass das in zwei Sätzen mit einem eigenen Beispiel zusammen.'
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
				text: 'Stark – Maximum abziehen sitzt, und der Unterschied zwischen hoher Zahl und echter Trefferquote auch. Jag jetzt deine Tests drüber.'
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
	text: 'Erklär kurz in einem Satz, warum preise nach der ersten Schleife gleich bleibt, und schreib dann deine Korrektur.'
};

const pythonScenario: LabeledTutorScenario = {
	id: 'schleifenvariable-listenfach',
	shortLabel: 'Python',
	task: task('python-einstieg', 'a-schleifenvariable-vorhersagen'),
	title: 'Warum bleibt die Liste gleich?',
	setup:
		'Nach `for p in preise: p = p * 2` hast du [20, 40, 60] erwartet, Python gibt aber [10, 20, 30] aus. Mit `neu.append(p * 2)` kommt [20, 40, 60] raus.',
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
		text: 'Schau dir andere Zahlen an: zahlen = [1, 2], dann for z in zahlen: z = z + 10. Runde 1: z zeigt erst auf 1, dann auf 11 – zahlen[0] bleibt bei 1. Runde 2: z zeigt erst auf 2, dann auf 12. Am Ende steht in zahlen immer noch [1, 2]. Jetzt zu deiner Schleife.'
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
				text: 'Schauen wir in den ersten Durchlauf: Worauf zeigt p vor p = p * 2, und worauf zeigt preise[0]?'
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
						text: 'Mal kurz zwei Kästchen auf: eins für preise[0], eins für p. Worauf zeigen beide vor p = p * 2?'
					}
				},
				{
					id: 'delegation-loesung',
					trigger: { kind: 'contains', phrases: ['sag mir einfach'] },
					reply: {
						move: 'kurz_erklaeren',
						text: 'Die Zeile schreibst du gleich selbst – wir klären erst, warum die alte nichts ändert. Worauf zeigt p im ersten Durchlauf?'
					}
				}
			],
			nextStepId: 'pfeile'
		},
		{
			id: 'pfeile',
			prompt: {
				move: 'vorhersage_verlangen',
				text: 'Jetzt läuft p = p * 2. Welcher Pfeil zieht um – der von p oder der von preise[0]?'
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
						text: 'Vergleich mal: b = 5, a = b, b = b + 1. Was steht danach in a? Dann siehst du sofort, ob p und preise[0] dasselbe Kästchen sind.'
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
						text: 'Kein Problem: Ein einfaches = bindet immer nur den Namen links neu. Was steht links – preise[0] oder p?'
					},
					nextStepId: 'welcher-pfeil-2'
				},
				{
					id: 'unsicher',
					trigger: { kind: 'contains', phrases: ['nicht sicher'] },
					reply: {
						move: 'gestufter_hinweis',
						text: 'Kein Problem: Ein einfaches = bindet immer nur den Namen links neu. Was steht links – preise[0] oder p?'
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
						text: 'Schreib dir drei Spalten auf: Durchlauf, p, preise. Was steht im ersten Durchlauf vor und nach p = p * 2 drin?'
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
						text: "Anderes Beispiel: namen = ['ada', 'bo'], dann for n in namen: n = n.upper(). Danach steht in namen weiter ['ada', 'bo'], weil n = … nur n umhängt. Welcher Name spielt bei dir die Rolle von n?"
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
				text: 'Alles klar. Neuer Fall: sicherung = preise, danach preise.append(40). Was gibt print(sicherung) aus?'
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
						text: 'Klappt auch – verändert aber die alte Liste direkt statt eine neue zu bauen. Welche Variante willst du, wenn du die alten Preise noch brauchst?'
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
				text: 'Alles klar: Namen neu binden und Liste verändern sind zwei Paar Schuhe. Probier deine Vorhersage kurz in Python aus.'
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
						text: 'Vorhin hat = nur einen Namen umgehängt, jetzt ändert append die Liste selbst. Wie viele Listen gibt es nach sicherung = preise – eine oder zwei?'
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
	text: 'Im Experiment von Roediger & Karpicke (2006) lag nach fünf Minuten die Lesegruppe vorn, nach einer Woche klar die Abrufgruppe. Wie baust du Mias zwölf Stunden damit um?'
};

const learningScenario: LabeledTutorScenario = {
	id: 'abrufen-statt-wiederlesen',
	shortLabel: 'Lernen',
	task: task('lernen-gestalten', 'a-lg-lernplan-klausur'),
	title: 'Reicht dreimal Lesen?',
	setup:
		'Mia schreibt in drei Wochen Statistik. Ihr Plan: am Wochenende davor das Skript dreimal lesen und markieren – sechs Stunden am Samstag, sechs am Sonntag. Bringt das was, und wie holst du aus denselben zwölf Stunden mehr raus?',
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
		text: 'Anderes Fach: Ole hat zehn Stunden für Vokabeln in vier Wochen. Statt zwei Leseabenden plant er fünfmal zwei Stunden. Jede Runde startet mit abgedeckter Liste, erst danach schlägt er Fehler nach. Wie überträgst du das auf Mias Plan?'
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
				text: 'Was muss Mia in der Klausur können: Formeln im Skript wiedererkennen oder frei aus dem Kopf abrufen?'
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
						text: 'Zeitblöcke bauen wir gern gleich zusammen – erst zählt aber, warum der alte Plan wackelt. Was muss Mia in der Klausur mit dem Stoff tun?'
					}
				},
				{
					id: 'fv-wiederlesen-reicht',
					trigger: { kind: 'contains', phrases: ['kennt'] },
					reply: {
						move: 'nachhaken',
						text: '„Kennt“ klingt gut – aber liegt das Skript in der Klausur neben ihr, oder muss sie alles frei hervorholen?'
					}
				}
			],
			nextStepId: 'wiedererkennen'
		},
		{
			id: 'wiedererkennen',
			prompt: {
				move: 'vorhersage_verlangen',
				text: 'Schätz mal: Zwei Gruppen lernen gleich lang. Gruppe A liest einen Text mehrmals, Gruppe B liest einmal und schreibt alles frei aus dem Kopf auf. Wer liegt nach fünf Minuten vorn – und wer nach einer Woche?'
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
						text: 'Probier’s direkt aus: Wie berechnet man den Median? Schreib die Schritte kurz aus dem Kopf auf, ohne nachzuschauen.'
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
				text: 'Genau diese Lücke deckt drittes Lesen nicht auf. Jetzt schätz mal: Gruppe A liest mehrmals, Gruppe B liest einmal und schreibt frei auf. Wer liegt nach fünf Minuten vorn, wer nach einer Woche?'
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
						text: 'Kein Problem, kurzes Beispiel: [7, 3, 9, 4] sortiert ist [3, 4, 7, 9]. Gerade Anzahl, also die Mitte aus 4 und 7: 5,5. Jetzt du: Was ist der Median von [8, 1, 5, 2]?'
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
						text: 'Trenn die beiden Zeitpunkte: Nach fünf Minuten hilft, was gerade frisch vor Augen lag. Nach einer Woche zählt, was du frei abrufen kannst. Wer hat das geübt?'
					},
					nextStepId: 'vorhersage-2'
				},
				{
					id: 'fv-abruf-immer-vorn',
					trigger: { kind: 'contains', phrases: ['beiden zeitpunkten'] },
					reply: {
						move: 'kontrastfall',
						text: 'Kurz nachgedacht bei den fünf Minuten: Wer hat den Wortlaut in dem Moment noch ganz frisch im Kopf – Gruppe A oder B?'
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
						text: 'Denk an eine Nummer auf dem Display: Du erkennst sie sofort wieder, kannst sie aber nicht frei aufsagen. Wie passt das zu Gruppe A und B?'
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
						text: 'Zwei Leute lernen Vokabeln: Eine liest die Liste fünfmal, die andere deckt ab und fragt sich dreimal selbst ab. Wer steht am nächsten Tag ohne Liste besser da?'
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
				text: 'Wie erklärst du Mia den neuen Plan? Ihr alter fühlt sich beim Lernen viel entspannter an – warum täuscht dieses Gefühl?'
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
						text: 'Es bleibt bei zwölf Stunden. Was änderst du innerhalb dieser zwölf Stunden?'
					},
					nextStepId: 'plan'
				},
				{
					id: 'fv-am-stueck-lernen-besser',
					trigger: { kind: 'contains', phrases: ['frisch'] },
					reply: {
						move: 'kontrastfall',
						text: 'Frisch im Kopf half im Versuch nur für fünf Minuten – die Klausur kommt aber nicht fünf Minuten nach dem Lesen.'
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
				text: 'Letzte Runde: In der Klausur taucht eine unbekannte Aufgabe auf. Woran merkst du, ob Mittelwert, Median oder Varianz gefragt ist – und wie übst du genau diese Auswahl vorher?'
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
				text: 'Alles klar – dein Plan steht. Wenn du magst, teilen wir jetzt sechs Blöcke ein; fällt einer aus, schiebst du ihn einfach weiter.'
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
