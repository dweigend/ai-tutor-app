import type { CourseRef } from '../api/types.js';
import type { MockFixtures } from '../api/mock.js';
import type { ArtImage } from './magazin.js';
import { attentionDeckLatex } from '../math/attention-terms.js';
import { editorialFormulas, formulaRef } from '../math/editorial-formulas.js';
import { paragraphs } from './markdown.js';
import { repoSource, studies } from './sources.js';
import type { InteractiveTutorial, TutorialCheck, TutorialCheckRule } from './types.js';

export interface EditorialTutorial extends InteractiveTutorial {
	subtitle: string;
	art: ArtImage;
}

type TutorialCheckFixture = MockFixtures['tutorials'][number];

const course: CourseRef = { courseId: 'ki-selbst-bauen', courseVersion: '0.1.0' };

function choice(
	id: string,
	prompt: string,
	options: readonly (readonly [id: string, label: string])[],
	multiple = false
): TutorialCheck {
	return {
		id,
		prompt,
		answerKind: 'choice',
		options: options.map(([optionId, label]) => ({ id: optionId, label })),
		multiple
	};
}

function textCheck(id: string, prompt: string): TutorialCheck {
	return { id, prompt, answerKind: 'text' };
}

// Learners type either the ASCII hyphen or the typographic minus.
function signedVariants(value: string): readonly string[] {
	return value.startsWith('-') ? [value, `−${value.slice(1)}`] : [value];
}

// ---------------------------------------------------------------------------------------------
// Tutorial 1 · Attention und Softmax
// ---------------------------------------------------------------------------------------------

const ATTENTION_ID = 'attention-skalierung';

export const attentionTutorial: EditorialTutorial = {
	id: ATTENTION_ID,
	course,
	title: 'Wie Attention gewichtet, ohne zu erstarren',
	subtitle: 'Eine einzige Division hält die Gewichte im Transformer beweglich.',
	summary:
		'Eine einzige Division entscheidet, ob ein Attention-Kopf noch dazulernt. Du sagst voraus, wie das Teilen die Gewichte verändert, prüfst deine Vermutung am Regler und hältst die Skalierung im Netz sauber von Temperatur und Kalibrierung auseinander.',
	minutes: [8, 12],
	art: {
		src: '/art/tutorial-schichten.webp',
		alt: 'Überlagerte Kreise in Orange und Grau, die sich teilweise durchdringen'
	},
	steps: [
		{
			id: 'deuten',
			title: 'Bauplan eines Attention-Kopfs',
			blocks: [
				{
					id: 'formel',
					kind: 'explanation',
					markdown: paragraphs(
						'So rechnet ein Attention-Kopf.',
						formulaRef('attention-formel'),
						'Lies sie von innen nach außen. Was wird mit wem multipliziert, was wird normiert, was wird am Ende gewichtet?'
					)
				},
				{
					id: 'vergleichen-mischen',
					kind: 'prediction',
					check: choice(
						'vergleich-mischen',
						'Was wird hier verglichen, und was wird anschließend gemischt?',
						[
							['q-k-v', 'Queries werden mit Keys verglichen, gemischt werden die Values.'],
							['q-v-k', 'Queries werden mit Values verglichen, gemischt werden die Keys.'],
							['k-k-q', 'Keys werden untereinander verglichen, gemischt werden die Queries.'],
							['alles', 'Alle drei werden gleichberechtigt miteinander verglichen.']
						]
					),
					reasoningPrompt: 'Schreib in einem Satz, woran du das in der Formel erkennst.',
					revealMarkdown: paragraphs(
						'Jede Query wird per Skalarprodukt mit jedem Key verglichen. Das ergibt pro Query eine Zeile von Scores, eine Zahl je Position.',
						'Die Softmax macht aus dieser Zeile Gewichte, die zusammen 1 ergeben. Mit diesen Gewichten wird ein Mittel der Values gebildet. Q und K entscheiden also, *wohin* geschaut wird. V bestimmt, *was* dort abgeholt wird.'
					)
				}
			]
		},
		{
			id: 'vorhersagen',
			title: 'Drei Rohwerte durch zehn geteilt',
			blocks: [
				{
					id: 'zeile',
					kind: 'explanation',
					markdown: paragraphs(
						`Eine Query liefert gegen drei Keys die Scores **[20, 10, 0]**. Die Vektoren haben ${formulaRef('key-dimension')} = 100 Komponenten, also ist ${formulaRef('key-root')} = 10.`,
						'Noch keine Balken. Erst deine Vorhersage.'
					)
				},
				{
					id: 'gewichte-vorhersage',
					kind: 'prediction',
					check: choice(
						'gewicht-vorhersagen',
						'Wie ändern sich die Gewichte, wenn du die Scores durch 10 teilst?',
						[
							['spitzer', 'Spitzer: Der größte Balken wächst noch.'],
							['gleich', 'Gleich: Teilen ändert an der Softmax nichts.'],
							['flacher', 'Flacher: Die Balken rücken zusammen.']
						]
					),
					reasoningPrompt:
						'Worauf reagiert die Softmax: auf die Werte selbst oder auf ihre Abstände?',
					askConfidence: true,
					revealMarkdown: paragraphs(
						'Ohne Division gibt die Softmax **[0,9999546; 0,0000454; 0,000000002]**. Nach der Division wird aus [20, 10, 0] die Zeile [2, 1, 0], und die Gewichte sind **[0,665; 0,245; 0,090]**.',
						'Die Softmax reagiert auf Abstände. Teilen schrumpft die Abstände, also werden die Gewichte flacher. Eine gemeinsame Verschiebung aller Scores, etwa +100, ließe sie dagegen unverändert.'
					)
				},
				{
					id: 'rang-vorhersage',
					kind: 'prediction',
					check: choice('rang-bleibt', 'Bleibt nach der Division dieselbe Position vorn?', [
						['ja', 'Ja, die Reihenfolge bleibt.'],
						['nein', 'Nein, die Reihenfolge kann kippen.']
					]),
					askConfidence: true,
					revealMarkdown:
						'Ja. Teilen durch eine positive Zahl erhält die Reihenfolge. Position 1 bleibt vorn, sie erhält nur nicht mehr fast das ganze Gewicht.'
				}
			]
		},
		{
			id: 'vergleichen',
			title: 'Wenn ein Gewicht fast alles schluckt',
			blocks: [
				{
					id: 'rundung',
					kind: 'worked-example',
					markdown: paragraphs(
						'Mit vier Nachkommastellen zeigt der unskalierte Balken **1,0000**. Das ist gerundet. Der genaue Wert ist 0,9999546, und die beiden anderen sind klein, aber nicht null. Gerundete Nullen sind keine exakten Nullen.',
						`Wichtiger ist, wie stark sich der größte Balken noch bewegen lässt. Die lokale Ableitung eines Softmax-Anteils nach seinem eigenen, bereits skalierten Logit ist ${formulaRef('softmax-ableitung')}.`,
						'- Unskaliert: 0,9999546 · 0,0000454 ≈ **0,0000454**\n- Skaliert: 0,665 · 0,335 ≈ **0,2227**',
						'Das ist ein Unterschied von fast vier Größenordnungen. Wer die Ableitung nach dem *unskalierten* Score betrachtet, multipliziert im skalierten Zweig noch mit 1/10. Der Abstand bleibt trotzdem riesig.',
						`Die Begründung bei Vaswani et al.: Haben Query und Key unabhängige, nullzentrierte Komponenten mit Varianz 1, wächst die Varianz ihres Skalarprodukts wie ${formulaRef('key-dimension')}. Das Teilen durch ${formulaRef('key-root')} hält diese Größenordnung stabil, solange die Annahmen ungefähr gelten.`
					)
				},
				{
					id: 'quiz-ableitung',
					kind: 'micro-quiz',
					checks: [
						choice(
							'ableitung-groesster-balken',
							'Warum lernt ein Kopf mit unskalierten Scores wie [20, 10, 0] kaum noch?',
							[
								[
									'gradient-klein',
									'Die Ableitung p · (1 − p) ist fast null, Updates bewegen kaum etwas.'
								],
								['falsch-berechnet', 'Die Softmax wird bei großen Zahlen falsch berechnet.'],
								['rang-falsch', 'Die Reihenfolge der Positionen ist falsch.'],
								['zu-viele', 'Es gibt zu viele Positionen für eine Softmax.']
							]
						)
					]
				}
			]
		},
		{
			id: 'experimentieren',
			title: 'Zwei Regler, zwei Aufgaben',
			blocks: [
				{
					id: 'labor-anleitung',
					kind: 'explanation',
					markdown: paragraphs(
						'Das Labor hat zwei Modi. Bediene sie einzeln, damit du siehst, welcher Regler welche Wirkung hat.',
						`**Skalierung:** Logits editieren, Division durch ${formulaRef('key-root')} an- und ausschalten, ${formulaRef('key-dimension')} verändern.`,
						`**Sampling:** Die Logits bleiben fest, du veränderst die Temperatur T. Gerechnet wird ${formulaRef('sampling-temperatur')}. Mit 100 Ziehungen siehst du, wie oft jede Position gewählt wird. Die Ziehungen schwanken. Ein fester Seed macht einen Lauf wiederholbar.`
					)
				},
				{
					id: 'labor',
					kind: 'lab',
					requiresPredictionId: 'gewichte-vorhersage',
					config: {
						kind: 'softmax-attention',
						logits: [20, 10, 0],
						scaling: { enabled: true, keyDimension: 100, range: { min: 1, max: 256, step: 1 } },
						sampling: {
							temperature: 1,
							range: { min: 0.25, max: 10, step: 0.25 },
							draws: 100,
							seed: 7
						}
					}
				},
				{
					id: 'labor-deutung',
					kind: 'explanation',
					markdown:
						'Höheres T macht die Verteilung flacher, niedrigeres spitzer. Bei festen Logits ändert T die Reihenfolge nie. Beachte: Diese Sampling-Temperatur steuert, wie gezogen wird. Mit der Frage, ob eine Wahrscheinlichkeit stimmt, hat sie nichts zu tun.'
				}
			]
		},
		{
			id: 'uebertragen',
			title: 'Was Gewichte verraten und was nicht',
			blocks: [
				{
					id: 'temperatur-vorhersage',
					kind: 'prediction',
					check: choice(
						'temperatur-rang',
						'Neue Zeile [6, 3, 0]. Die Temperatur steigt von T = 1 auf T = 3. Was passiert?',
						[
							['gleich-flacher', 'Gleiche Reihenfolge, flachere Verteilung.'],
							['gleich-spitzer', 'Gleiche Reihenfolge, spitzere Verteilung.'],
							['rang-wechselt', 'Die Reihenfolge ändert sich.'],
							['gleichverteilt', 'Alle drei Positionen werden gleich wahrscheinlich.']
						]
					),
					askConfidence: true,
					revealMarkdown: paragraphs(
						'Bei T = 1 ergibt [6, 3, 0] etwa **[0,950; 0,047; 0,002]**. Bei T = 3 rechnet die Softmax mit [2, 1, 0] und liefert **[0,665; 0,245; 0,090]**.',
						'Die Reihenfolge bleibt, die Verteilung wird flacher. Gleichverteilt wird sie erst, wenn T sehr groß wird, und auch dann nur näherungsweise.'
					)
				},
				{
					id: 'quiz-uebertragen',
					kind: 'micro-quiz',
					checks: [
						choice(
							'kausal-erste-position',
							'Ein kausaler Kopf: Position 0 darf nur sich selbst sehen. Welches Gewicht erhält sie dort, und was ist ihre Ausgabe?',
							[
								['eins-v0', 'Gewicht 1, Ausgabe genau V₀.'],
								['haelfte', 'Gewicht 0,5, Ausgabe ein Mittel aus V₀ und V₁.'],
								['abhaengig', 'Das hängt von den Scores ab.'],
								['null', 'Gewicht 0, weil die Maske alles sperrt.']
							]
						),
						choice(
							'kalibrierung-beobachtung',
							'Welche Beobachtung bräuchtest du, um eine vorhergesagte Wahrscheinlichkeit von 0,95 als verlässlich zu deuten?',
							[
								[
									'trefferquote',
									'Von vielen ähnlich bewerteten Fällen sind rund 95 % tatsächlich richtig.'
								],
								['grosse-logits', 'Die Logits sind deutlich größer als bei anderen Fällen.'],
								['niedrige-temperatur', 'Die Vorhersage wurde mit niedriger Temperatur erzeugt.'],
								['einzelfall', 'Dieser eine Fall hat sich als richtig herausgestellt.']
							]
						),
						choice(
							'gewichte-als-erklaerung',
							'Erklären hohe Attention-Gewichte, warum ein Modell so entschieden hat?',
							[
								[
									'nicht-automatisch',
									'Nicht automatisch. Ob Gewichte als Erklärung taugen, muss eigens geprüft werden.'
								],
								['ja', 'Ja, das Gewicht zeigt direkt, was die Entscheidung verursacht hat.'],
								['nie', 'Nein, Attention-Gewichte enthalten nie erklärende Information.']
							]
						)
					]
				}
			]
		}
	],
	sources: [
		studies.vaswani,
		{
			label: 'Jain & Wallace 2019 · Attention is not Explanation',
			href: 'https://aclanthology.org/N19-1357/'
		},
		{
			label: 'Wiegreffe & Pinter 2019 · Attention is not not Explanation',
			href: 'https://aclanthology.org/D19-1002/'
		},
		studies.guo,
		repoSource(
			'Aufgabe · Kausale Attention',
			'pakete/kurse/ki-selbst-bauen/aufgaben/a-m9-kausale-attention.yaml'
		),
		repoSource(
			'Aufgabe · Bigramm und Temperatur',
			'pakete/kurse/ki-selbst-bauen/aufgaben/a-m7-bigramm-temperatur.yaml'
		)
	]
};

// ---------------------------------------------------------------------------------------------
// Tutorial 2 · Backpropagation und Gradientenabstieg
// ---------------------------------------------------------------------------------------------

const BACKPROP_ID = 'backprop-zwei-kanten';

export const backpropTutorial: EditorialTutorial = {
	id: BACKPROP_ID,
	course,
	title: 'Wie Fehler rückwärts durchs Netz wandern',
	subtitle: 'Backpropagation und Abstieg an einem überschaubaren Rechennetz.',
	summary:
		'Woher weiß ein Parameter tief im Netz, in welche Richtung er sich ändern muss? Du rechnest ein kleines Knotennetz erst vorwärts, sagst den Rückfluss an einer Weggabelung voraus und überprüfst jede Ableitung mit deinem eigenen numerischen Prüfstand, bevor du einen Schritt ins Tal setzt.',
	minutes: [12, 18],
	art: {
		src: '/art/tutorial-schalttafel.webp',
		alt: 'Schwarze Fläche mit der Silhouette eines alten Schaltpults'
	},
	steps: [
		{
			id: 'vormachen',
			title: 'Aufwärmrunde an einem Knoten',
			blocks: [
				{
					id: 'parallelfall',
					kind: 'worked-example',
					beginnerOnly: true,
					markdown: paragraphs(
						`Ein vorgerechneter Parallelfall: ${formulaRef('backprop-parallel')} mit a = 3 und b = 2. Jeder Knoten trägt oben seinen Wert, unten seinen Gradienten.`,
						'1. Vorwärts: L = 6.\n2. Start rückwärts: L.grad = 1, denn L ändert sich mit sich selbst eins zu eins.\n3. Kante zu a: Wächst a um ein kleines Stück, wächst L um b-mal so viel. Also a.grad = b · L.grad = 2.',
						'Die Kante zu b ergänzt du selbst.'
					)
				},
				{
					id: 'quiz-luecke',
					kind: 'micro-quiz',
					checks: [
						textCheck(
							'luecke-b-grad',
							'Im Beispiel L = a · b mit a = 3, b = 2: Wie groß ist b.grad?'
						)
					]
				}
			]
		},
		{
			id: 'vorwaerts',
			title: 'Drei Stationen bis zum Ergebnis',
			blocks: [
				{
					id: 'graph',
					kind: 'explanation',
					markdown: paragraphs(
						`Jetzt der eigentliche Graph: ${formulaRef('backprop-hauptgraph')} mit a = 2, b = −3 und c = 10.`,
						'Zerlege ihn in drei Knoten: e = a · b, dann d = e + c, dann L = d · d. Schreib das Quadrat bewusst als Produkt. So siehst du, dass d an zwei Eingängen von L steht.'
					)
				},
				{
					id: 'vorwaerts-vorhersage',
					kind: 'prediction',
					check: choice('vorwaertswerte', 'Welche Werte haben e, d und L?', [
						['richtig', 'e = −6, d = 4, L = 16'],
						['vertauscht', 'e = −6, d = 16, L = 4'],
						['vorzeichen', 'e = 6, d = 16, L = 256'],
						['verdoppelt', 'e = −6, d = 4, L = 8']
					]),
					revealMarkdown:
						'e = 2 · (−3) = −6, d = −6 + 10 = 4, L = 4 · 4 = 16. Wer 8 hat, hat d verdoppelt statt quadriert. Wer 256 hat, hat beim Vorzeichen von b den Faden verloren.'
				},
				{
					id: 'd-grad-vorhersage',
					kind: 'prediction',
					check: choice('d-grad', 'Wie groß wird d.grad im Rückwärtslauf?', [
						['vier', '4'],
						['acht', '8'],
						['sechzehn', '16'],
						['zwei', '2']
					]),
					reasoningPrompt: 'Begründe in einem Satz, bevor du auflöst.',
					askConfidence: true,
					revealMarkdown: paragraphs(
						'**d.grad = 8.** L = d · d hat zwei Eingänge, und beide sind d. Über den linken Eingang kommt der Beitrag „rechter Faktor mal L.grad“ = 4. Über den rechten kommt ebenso 4.',
						'Beide Beiträge werden addiert. Wer 4 vorhergesagt hat, hat einen Pfad gefunden und den zweiten übersehen. Das ist der häufigste Fehler an dieser Stelle.'
					)
				}
			]
		},
		{
			id: 'rueckwaerts',
			title: 'Der eigene Prüfstand gegen die Formel',
			blocks: [
				{
					id: 'labor',
					kind: 'lab',
					requiresPredictionId: 'd-grad-vorhersage',
					config: {
						kind: 'backpropagation',
						inputs: { a: 2, b: -3, c: 10 },
						inputRange: { min: -10, max: 10, step: 1 },
						squareAsProduct: true,
						activeEdges: { left: true, right: true },
						accumulation: 'add',
						finiteDifference: { h: 0.001, exponentRange: { min: -8, max: -2, step: 1 } }
					}
				},
				{
					id: 'probe',
					kind: 'worked-example',
					markdown: paragraphs(
						'Die numerische Probe am Startbeispiel: Schiebt man a auf 2,001, wird L = 15,976009. Die Änderung ist −0,023991, geteilt durch 0,001 also etwa −24. Mit der zentralen Differenz, a einmal um h nach oben und einmal nach unten, kommt bei a genau −24 heraus.',
						'Die Kettenregel liefert dasselbe.',
						formulaRef('backprop-kettenregel'),
						'Ebenso b.grad = 8 · a = 16 und c.grad = 8.',
						'Schalte im Labor eine der beiden Kanten von d nach L aus. Die Probe und der Rückwärtslauf laufen sofort auseinander.'
					)
				},
				{
					id: 'quiz-rueckwaerts',
					kind: 'micro-quiz',
					checks: [
						textCheck('a-grad', 'Welchen Wert hat a.grad im Startbeispiel?'),
						choice('h-kleiner', 'Wird die numerische Probe immer genauer, je kleiner h ist?', [
							['ja', 'Ja, kleiner ist immer genauer.'],
							[
								'rundung',
								'Nein. Bei sehr kleinem h verstärkt die Subtraktion fast gleicher Zahlen Rundungsfehler.'
							],
							['nur-gerade', 'Nein, die Probe funktioniert nur bei geraden Zahlen.']
						])
					]
				}
			]
		},
		{
			id: 'zwei-fehler',
			title: 'Zwei leise Saboteure im Code',
			blocks: [
				{
					id: 'fehlerbilder',
					kind: 'explanation',
					markdown: paragraphs(
						'Zwei Fehler sehen im Code harmlos aus und richten Verschiedenes an.',
						'**Überschreiben statt addieren:** Steht in `backward()` ein `=` statt `+=`, löscht der zweite Beitrag den ersten. Schalte im Labor auf „überschreiben“ und beobachte d.grad.',
						'**Vertauschte Faktoren:** Ein KI-Vorschlag für die Multiplikation gibt jedem Faktor seinen eigenen Wert als Gradient statt den des anderen. Dieser Fehler braucht einen anderen Prüffall als der erste.'
					)
				},
				{
					id: 'quiz-fehler',
					kind: 'micro-quiz',
					checks: [
						choice('ueberschreiben', 'Mit `=` statt `+=`: Welchen Wert zeigt d.grad?', [
							['vier', '4'],
							['acht', '8'],
							['null', '0'],
							['sechzehn', '16']
						]),
						choice(
							'vertauschte-faktoren',
							'Welcher Prüffall entlarvt die vertauschten Faktoren in der Multiplikation?',
							[
								['x-mal-x', 'x · x an der Stelle x = 3'],
								['ungleich', 'a · b mit a = 2 und b = −3'],
								['gleich', 'a · b mit a = 2 und b = 2']
							]
						),
						choice(
							'backward-update',
							'Was stimmt über einen Trainingsschritt? Wähle alle zutreffenden Aussagen.',
							[
								[
									'backward-berechnet',
									'`backward()` berechnet Gradienten und ändert keine Parameter.'
								],
								['update-aendert', 'Erst der Optimierungsschritt ändert die Parameter.'],
								[
									'zero-grad',
									'Vor dem nächsten `backward()` werden die Parametergradienten genullt.'
								],
								['backward-aendert', '`backward()` schiebt die Gewichte schon Richtung Minimum.']
							],
							true
						)
					]
				}
			]
		},
		{
			id: 'bergab',
			title: 'Vom Fehlersignal zum Schritt ins Tal',
			blocks: [
				{
					id: 'update-regel',
					kind: 'explanation',
					markdown: paragraphs(
						`Mit dem Gradienten in der Hand ist der Update-Schritt kurz: ${formulaRef('gd-update')}. Die Lernrate bestimmt, wie weit.`,
						`Für ${formulaRef('gd-parabel')} ist der Gradient 2 · (w − 3). Daraus folgt eine handliche Regel: Der Abstand zum Minimum wird pro Schritt mit dem Faktor (${formulaRef('gd-faktor')}) multipliziert. Bei Start w = 5 und einer Lernrate von 0,25 ergibt das 4, dann 3,5, dann 3,25.`
					)
				},
				{
					id: 'lernrate-vorhersage',
					kind: 'prediction',
					check: choice(
						'lernrate-schritte',
						'Start w = 5, jetzt mit Lernrate 1. Welche drei Werte folgen?',
						[
							['halbieren', '4, 3,5, 3,25'],
							['pendeln', '1, 5, 1'],
							['treffer', '3, 3, 3'],
							['divergiert', '−1, 11, −13']
						]
					),
					askConfidence: true,
					revealMarkdown: paragraphs(
						'Bei Lernrate 1 ist der Faktor 1 − 2 = −1. Der Abstand bleibt gleich groß, nur das Vorzeichen kippt. w springt zwischen 1 und 5 hin und her.',
						'Die Folge −1, 11, −13 gehört zur Lernrate 1,5 mit dem Faktor −2. Dann wächst der Abstand mit jedem Schritt. Eine große Lernrate ist also nicht einfach schneller.'
					)
				}
			]
		},
		{
			id: 'ohne-hilfe',
			title: 'Freier Lauf auf Papier',
			blocks: [
				{
					id: 'neue-werte',
					kind: 'explanation',
					markdown:
						'Derselbe Graph, neue Werte: **a = 1, b = −2, c = 5**. Kein Labor, kein Hinweis. Rechne auf Papier vorwärts und rückwärts.'
				},
				{
					id: 'quiz-transfer',
					kind: 'micro-quiz',
					checks: [
						textCheck('transfer-d-grad', 'Wie groß ist d.grad?'),
						textCheck('transfer-a-grad', 'Wie groß ist a.grad?')
					]
				},
				{
					id: 'spaeter',
					kind: 'explanation',
					markdown:
						'In ein paar Tagen kommt eine kurze Abrufkarte zu `+=`. Danach folgt eine Aufgabe aus einem ganz anderen Gebiet, der Endpreis in einem Onlineshop. Die Kettenregel ist dieselbe.'
				}
			]
		}
	],
	sources: [
		repoSource(
			'Aufgabe · Mehrfachnutzung vorhersagen',
			'pakete/kurse/ki-selbst-bauen/aufgaben/a-bp-mehrfachnutzung-vorhersagen.yaml'
		),
		repoSource(
			'Aufgabe · KI-Backward prüfen',
			'pakete/kurse/ki-selbst-bauen/aufgaben/a-bp-ki-backward-pruefen.yaml'
		),
		repoSource(
			'Aufgabe · Schritte vorhersagen',
			'pakete/kurse/ki-selbst-bauen/aufgaben/a-gd-schritte-vorhersagen.yaml'
		),
		repoSource(
			'Fehlvorstellungen · KI selbst bauen',
			'pakete/kurse/ki-selbst-bauen/fehlvorstellungen.yaml'
		)
	]
};

export const tutorials: readonly EditorialTutorial[] = [attentionTutorial, backpropTutorial];

// ---------------------------------------------------------------------------------------------
// Curated answers for MockTutorClient, kept apart from the material shown before submission.
// ---------------------------------------------------------------------------------------------

function choiceRule(
	optionIds: readonly string[],
	feedback: string,
	partial = false
): TutorialCheckRule {
	return {
		accepted: { kind: 'choice', optionIds: [...optionIds] },
		result: partial ? 'teilweise' : 'korrekt',
		feedback
	};
}

function textRules(value: string, feedback: string): TutorialCheckRule[] {
	return signedVariants(value).map((text) => ({
		accepted: { kind: 'text', text },
		result: 'korrekt',
		feedback
	}));
}

function attentionCheck(
	checkId: string,
	rules: TutorialCheckFixture['rules'],
	feedback: string,
	learningGoalId = 'lz-softmax-kreuzentropie-erklaeren'
): TutorialCheckFixture {
	return { course, tutorialId: ATTENTION_ID, checkId, learningGoalId, rules, feedback };
}

function backpropCheck(
	checkId: string,
	rules: TutorialCheckFixture['rules'],
	feedback: string,
	learningGoalId = 'lz-rechengraph-gradienten'
): TutorialCheckFixture {
	return { course, tutorialId: BACKPROP_ID, checkId, learningGoalId, rules, feedback };
}

export const tutorialChecks: readonly TutorialCheckFixture[] = [
	attentionCheck(
		'vergleich-mischen',
		[choiceRule(['q-k-v'], 'Queries und Keys bestimmen das Wohin, die Values das Was.')],
		'Schau, welche beiden Matrizen im Skalarprodukt stehen und welche erst nach der Softmax auftaucht.'
	),
	attentionCheck(
		'gewicht-vorhersagen',
		[choiceRule(['flacher'], 'Die Gewichte rücken zusammen. Ihre Reihenfolge bleibt erhalten.')],
		'Vergleiche, wie groß die Abstände zwischen den Scores nach dem Teilen sind.'
	),
	attentionCheck(
		'rang-bleibt',
		[choiceRule(['ja'], 'Teilen durch eine positive Zahl erhält die Reihenfolge.')],
		'Ist 20 / 10 noch größer als 10 / 10? Teilen durch eine positive Zahl dreht keine Ungleichung um.'
	),
	attentionCheck(
		'ableitung-groesster-balken',
		[
			choiceRule(
				['gradient-klein'],
				'p · (1 − p) ist bei p ≈ 0,99995 fast null. Updates bewegen dann kaum etwas.'
			)
		],
		'Die Softmax rechnet hier richtig. Entscheidend ist, wie stark sich ein fast voller Balken noch bewegen lässt.'
	),
	attentionCheck(
		'temperatur-rang',
		[choiceRule(['gleich-flacher'], 'Höheres T schrumpft die Abstände. Die Reihenfolge bleibt.')],
		'Teile [6, 3, 0] durch 3 und vergleiche Reihenfolge und Abstände mit der Ausgangszeile.'
	),
	attentionCheck(
		'kausal-erste-position',
		[choiceRule(['eins-v0'], 'Nur eine Position ist zulässig, also erhält sie das ganze Gewicht.')],
		'Eine Softmax über genau einen zulässigen Eintrag: Welcher Wert bleibt übrig?'
	),
	attentionCheck(
		'kalibrierung-beobachtung',
		[choiceRule(['trefferquote'], 'Kalibrierung prüft man über viele Fälle, nicht an einem.')],
		'Große Logits und niedrige Temperatur machen eine Zahl steiler, aber nicht verlässlicher. Ein einzelner Treffer ist keine Quote.'
	),
	attentionCheck(
		'gewichte-als-erklaerung',
		[
			choiceRule(
				['nicht-automatisch'],
				'Jain & Wallace zeigen Gegenbeispiele, Wiegreffe & Pinter diskutieren, welche Tests eine Erklärung tragen.'
			)
		],
		'Beide Extreme sind zu stark. Die Forschung streitet darüber, unter welchen Tests Gewichte etwas erklären.'
	),
	backpropCheck(
		'luecke-b-grad',
		textRules('3', 'Wächst b um ein kleines Stück, wächst L um a-mal so viel.'),
		'Spiegle die Kante zu a: Welcher Faktor steht jetzt neben b?'
	),
	backpropCheck(
		'vorwaertswerte',
		[choiceRule(['richtig'], 'e = −6, d = 4, L = 16. Der Graph steht.')],
		'Rechne Knoten für Knoten: erst e = a · b, dann d = e + c, dann L = d · d.'
	),
	backpropCheck(
		'd-grad',
		[choiceRule(['acht'], 'Zwei Eingänge, zwei Beiträge von je 4.')],
		'An wie vielen Eingängen von L steht d? Jeder davon liefert einen eigenen Beitrag.'
	),
	backpropCheck(
		'a-grad',
		textRules('-24', 'd.grad · 1 · b = 8 · (−3) = −24. Die numerische Probe bestätigt es.'),
		'Geh den Pfad von L über d und e zu a und multipliziere die lokalen Ableitungen.'
	),
	backpropCheck(
		'h-kleiner',
		[choiceRule(['rundung'], 'Zu kleines h misst am Ende vor allem Rundungsfehler.')],
		'Was passiert, wenn man zwei fast gleiche Gleitkommazahlen voneinander abzieht?',
		'lz-gradientenfehler-finden'
	),
	backpropCheck(
		'ueberschreiben',
		[choiceRule(['vier'], 'Der zweite Beitrag überschreibt den ersten. Übrig bleibt 4.')],
		'Mit `=` zählt nur der zuletzt geschriebene Beitrag.',
		'lz-gradientenfehler-finden'
	),
	backpropCheck(
		'vertauschte-faktoren',
		[choiceRule(['ungleich'], 'Nur mit zwei verschiedenen Faktoren unterscheiden sich a und b.')],
		'Bei gleichen Faktoren sind „eigener Wert“ und „Wert des anderen“ dieselbe Zahl.',
		'lz-ki-backprop-pruefen'
	),
	backpropCheck(
		'backward-update',
		[
			choiceRule(
				['backward-berechnet', 'update-aendert', 'zero-grad'],
				'Berechnen, ändern, zurücksetzen: drei getrennte Schritte.'
			),
			choiceRule(
				['backward-berechnet', 'update-aendert'],
				'Richtig, eine Aussage fehlt noch.',
				true
			),
			choiceRule(['backward-berechnet', 'zero-grad'], 'Richtig, eine Aussage fehlt noch.', true),
			choiceRule(['update-aendert', 'zero-grad'], 'Richtig, eine Aussage fehlt noch.', true)
		],
		'`backward()` ändert keinen Parameter. Prüfe jede Aussage einzeln.'
	),
	backpropCheck(
		'lernrate-schritte',
		[choiceRule(['pendeln'], 'Faktor −1: gleicher Abstand, kippendes Vorzeichen.')],
		`Rechne den Faktor ${formulaRef('gd-faktor')} bei Lernrate 1 aus und wende ihn auf den Abstand 2 an.`,
		'lz-lernrate-erklaeren'
	),
	backpropCheck(
		'transfer-d-grad',
		textRules('6', 'd = 3, also zwei Beiträge von je 3.'),
		'Rechne zuerst vorwärts: e, dann d. Danach zählt jeder Eingang von L.'
	),
	backpropCheck(
		'transfer-a-grad',
		textRules('-12', 'd.grad · b = 6 · (−2) = −12.'),
		'Multipliziere d.grad mit der lokalen Ableitung von e nach a.'
	)
];

// ---------------------------------------------------------------------------------------------
// 3D slide decks of /erklaerungen (#60): five slides each. A slide is one headline, at most one
// formula and exactly one control; the 3D scene carries the rest.
// ---------------------------------------------------------------------------------------------

export type DeckId = 'attention' | 'backprop';
export type DeckPickKnob = 'focusToken' | 'node';
export type DeckRangeKnob = 'temperature' | 'a' | 'c' | 'lr';

export type DeckControl =
	| { kind: 'pick'; knob: DeckPickKnob; label: string; options: readonly string[] }
	| { kind: 'switch'; label: string }
	| {
			kind: 'range';
			knob: DeckRangeKnob;
			label: string;
			/** Stands before the value in the readout, e.g. `lr 0,25`. */
			prefix: string;
			min: number;
			max: number;
			step: number;
			digits: number;
			/** Notes of the valley challenge, judged when the grip is released. */
			challenge?: { short: string; overshoot: string; landed: string };
	  }
	| {
			kind: 'choice';
			label: string;
			options: readonly ['a', 'b'];
			hit: string;
			miss: string;
			/** Both gradients are equal in size. */
			tie: string;
	  }
	| { kind: 'bubbles'; solved: string; pickFirst: string };

export interface DeckFormula {
	/** LaTeX with its terms marked by `\htmlData{term=…}` for highlighting. */
	latex: string;
	spoken: string;
	/** The editorial formula behind it, published as screen context while a term is in focus. */
	source?: { id: string; latex: string };
}

export interface DeckSlide {
	id: string;
	/** The one line of the slide in RichText notation: at most two lines at 390px. */
	headline: string;
	formula?: DeckFormula;
	control: DeckControl;
}

export interface ExplainDeck {
	id: DeckId;
	/** Name on the deck switch. */
	label: string;
	tutorialId: string;
	courseId: string;
	title: string;
	slides: readonly DeckSlide[];
}

const term = (id: string, latex: string) => String.raw`\htmlData{term=${id}}{${latex}}`;

const attentionSource = editorialFormulas.get('attention-formel')!;
const attentionFormula: DeckFormula = {
	latex: attentionDeckLatex,
	spoken: attentionSource.spoken,
	source: { id: attentionSource.id, latex: attentionSource.latex }
};

const graphFormula: DeckFormula = {
	latex: String.raw`${term('loss', 'L')} = (${term('a', 'a')} \mathbin{${term('mul', String.raw`\cdot`)}} ${term('b', 'b')} \mathbin{${term('add', '+')}} ${term('c', 'c')})^2`,
	spoken: editorialFormulas.get('backprop-hauptgraph')!.spoken
};

export const explainDecks: readonly ExplainDeck[] = [
	{
		id: 'attention',
		label: 'Attention',
		tutorialId: ATTENTION_ID,
		courseId: course.courseId,
		title: attentionTutorial.title,
		slides: [
			{
				id: 'tokens',
				headline: 'Auf welche Wörter schaut ein Wort?',
				control: {
					kind: 'pick',
					knob: 'focusToken',
					label: 'Wort',
					options: ['T1', 'T2', 'T3', 'T4']
				}
			},
			{
				id: 'skalarprodukt',
				headline: 'Was sucht Q – und wer passt dazu?',
				formula: {
					latex: String.raw`${term('Q', 'Q')} \cdot ${term('K', String.raw`K^{\mathsf{T}}`)}`,
					spoken: 'Q mal K transponiert'
				},
				control: {
					kind: 'pick',
					knob: 'focusToken',
					label: 'Suchanfrage',
					options: ['Q1', 'Q2', 'Q3', 'Q4']
				}
			},
			{
				id: 'skalierung',
				headline: 'Was passiert ohne √d_{k}?',
				formula: {
					latex: String.raw`\dfrac{${term('Q', 'Q')}\,${term('K', String.raw`K^{\mathsf{T}}`)}}{${term('dk', String.raw`\sqrt{d_k}`)}}`,
					spoken: 'Q mal K transponiert, geteilt durch Wurzel aus d Index k'
				},
				control: { kind: 'switch', label: '√d_{k}' }
			},
			{
				id: 'softmax',
				headline: 'Dreh an T: Wie spitz werden die Gewichte?',
				formula: {
					latex: String.raw`\alpha = ${term('softmax', String.raw`\operatorname{softmax}`)}(z / T),\quad \sum_i \alpha_i = 1`,
					spoken:
						'Alpha gleich Softmax von z geteilt durch Temperatur T. Die Summe aller Alpha ist eins.'
				},
				control: {
					kind: 'range',
					knob: 'temperature',
					label: 'Temperatur',
					prefix: 'T',
					min: 0.5,
					max: 2.5,
					step: 0.1,
					digits: 1
				}
			},
			{
				id: 'bubbles',
				headline: 'Was macht welcher Teil? Ordne zu.',
				formula: attentionFormula,
				control: {
					kind: 'bubbles',
					solved: 'Alles klar – alle fünf sitzen.',
					pickFirst: 'Tippe erst links ein Symbol an.'
				}
			}
		]
	},
	{
		id: 'backprop',
		label: 'Backprop',
		tutorialId: BACKPROP_ID,
		courseId: course.courseId,
		title: backpropTutorial.title,
		slides: [
			{
				id: 'rechengraph',
				headline: 'Was passiert an welchem Knoten?',
				formula: graphFormula,
				control: {
					kind: 'pick',
					knob: 'node',
					label: 'Knoten',
					options: ['a', 'b', 'c', '×', '+', 'L']
				}
			},
			{
				id: 'vorwaerts',
				headline: 'Dreh an a: Was kommt bei L an?',
				formula: graphFormula,
				control: {
					kind: 'range',
					knob: 'a',
					label: 'Eingang a',
					prefix: 'a',
					min: -2,
					max: 2,
					step: 0.5,
					digits: 1
				}
			},
			{
				id: 'rueckwaerts',
				headline: 'Wo wirkt eine Änderung stärker: bei a oder b?',
				formula: graphFormula,
				control: {
					kind: 'choice',
					label: 'Zweig mit dem größeren Gradienten',
					options: ['a', 'b'],
					hit: 'Genau – bei a · b zählt jeweils der andere Faktor.',
					miss: 'Andersherum: Bei a · b zählt der jeweils andere Faktor.',
					tie: 'Gleich stark – a und b sind hier gleich groß.'
				}
			},
			{
				id: 'merge',
				headline: 'Zwei Pfade ins Quadrat: Beide Beiträge addieren sich.',
				formula: graphFormula,
				control: {
					kind: 'range',
					knob: 'c',
					label: 'Eingang c',
					prefix: 'c',
					min: -3,
					max: 3,
					step: 1,
					digits: 0
				}
			},
			{
				id: 'tal',
				headline: 'Wähl die Lernrate: ab ins Tal, ohne Überschwingen.',
				formula: graphFormula,
				control: {
					kind: 'range',
					knob: 'lr',
					label: 'Lernrate',
					prefix: 'lr',
					min: 0.05,
					max: 0.8,
					step: 0.05,
					digits: 2,
					challenge: {
						short: 'Noch zu klein – die Kugel bleibt am Hang stehen.',
						overshoot: 'Zu groß – die Kugel schießt übers Tal hinaus.',
						landed: 'Alles klar – sauber im Tal gelandet.'
					}
				}
			}
		]
	}
];
