# Schriften (lokal, WOFF2)

Die App lädt keine Schrift von außen. Alle Dateien entstehen mit
[`scripts/fonts/build-fonts.sh`](../../scripts/fonts/build-fonts.sh) aus den öffentlichen
Quellen. Eingebunden sind sie in [`src/lib/styles/fonts.css`](../../src/lib/styles/fonts.css),
die Regeln stehen in [`DESIGN.md`](../../DESIGN.md) §6.

| Datei                      |  Bytes | Inhalt                                                                                                           | Rolle                                                             | Lizenz                                                        |
| -------------------------- | -----: | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------- |
| `archivo-latin.woff2`      | 87 296 | Archivo, variabel (Gewicht 300–700, Breite 85–125 %), Latin, `←`–`↕`, Mathe, Tabellenziffern (`tnum`); ohne `↗`  | die eine Stimme der Oberfläche, per Preload                       | SIL OFL 1.1, [`OFL-Archivo.txt`](OFL-Archivo.txt)             |
| `archivo-latin-ext.woff2`  | 72 784 | Archivo, Latin-Ext                                                                                               | lädt nur bei Bedarf                                               | SIL OFL 1.1                                                   |
| `jetbrains-mono-var.woff2` | 42 840 | JetBrains Mono, variabel (Gewicht 400–700), Latin, Latin-Ext, Griechisch, Mathe, Pfeile, Rahmen- und Formzeichen | Code-Stimme, nur in `[data-code]`; lädt erst, wenn Code erscheint | SIL OFL 1.1, [`OFL-JetBrainsMono.txt`](OFL-JetBrainsMono.txt) |

Eine Icon-Schrift gibt es nicht. Zeichen sind SVG-Icons aus
[`src/lib/modules/core/icons.ts`](../../src/lib/modules/core/icons.ts) (`DESIGN.md` §7).

## Quellen (Stand 26.11.2026)

| Quelle                                                       | SHA-256                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------ |
| `google/fonts` · `ofl/archivo/Archivo[wdth,wght].ttf`        | `0e094a7d3c7c4c25cf1310c4b30014f1dae9332220b1c2c88f4fa996f0b05053` |
| `google/fonts` · `ofl/jetbrainsmono/JetBrainsMono[wght].ttf` | `48715a42ec242c21e9f02692891e147d022299a52e48d5e413e1a942193ffeda` |

Werkzeug: `uvx --from fonttools --with brotli` (`pyftsubset`, `fonttools varLib.instancer`).
Die Bytezahlen können zwischen zwei Läufen um wenige Byte schwanken.

## Zeichenumfang ändern

1. Bereich in `build-fonts.sh` anpassen (`LATIN`, `LATIN_EXT`, `MATH`, `GREEK`, `SHAPES`).
2. `scripts/fonts/build-fonts.sh` ausführen, Bytezahl hier nachtragen. Das Skript gibt am Ende die Codepoints jeder Archivo-Datei aus. Die `unicode-range` in `fonts.css` muss genau diesen Listen folgen.
3. `npm run check:glyphs` ausführen: jedes Zeichen der Inhalte braucht einen Eintrag in Archivo oder, für Formeln und Code, in JetBrains Mono.
