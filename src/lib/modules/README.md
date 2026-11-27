# Module auskoppeln

`index.ts` ist der Einstieg für alle neun Primitive, die Dienste `motion` und `ReadAloud` sowie `DataViz` und `SwipeRow`. `DuckStage` bleibt ein eigener Einstieg der App. Seine 3D-Szene lädt bei Bedarf aus `figures/`.

## Einstiegspunkte für ein Svelte-Paket

| Export          | Ausgabe                                                      |
| --------------- | ------------------------------------------------------------ |
| `.`             | `dist/index.js` mit `dist/index.d.ts` und Svelte-Komponenten |
| `./tokens.css`  | `dist/tokens.css` aus `src/lib/styles/tokens.css`            |
| `./modules.css` | `dist/modules.css` aus diesem Verzeichnis                    |

Setze für `.` im Paketmanifest die Bedingungen `types` und `svelte`. Setze `svelte` (5.57 oder höher innerhalb von 5.x) und `bits-ui` (2.22 oder höher innerhalb von 2.x) als Peer-Abhängigkeiten. Führe beide CSS-Dateien unter `sideEffects`, damit der Bundler die Styles erhält. Importiere zuerst `tokens.css`, dann `modules.css`. Die App lädt zusätzlich `reset.css`, `fonts.css` und `base.css`. Stelle in einem anderen Host das entsprechende Basis-CSS bereit, insbesondere `[data-surface]`, `.visually-hidden` und die lokalen Webfonts Archivo und JetBrains Mono. Zeichen kommen als `Icon` aus dem Modul, die Code-Stimme bindet `modules.css` an `[data-code]`.

## Build-Vertrag

1. Führe `npm run check:modules` in `ui/` aus. Relative Modulimporte bleiben innerhalb des Modulbaums. App-Daten, Routen und Adapter kommen über Props und Snippets hinein.
2. Lege für den Paket-Build eine Kopie dieses Verzeichnisses an. Lass Tests und diese README aus der Kopie weg und ergänze `src/lib/styles/tokens.css` als `tokens.css`.
3. Rufe die lokal installierte CLI mit `svelte-package -i <quellverzeichnis> -o dist` auf. Prüfe die drei Exportpfade und das Ergebnis von `npm pack --dry-run` im Paketverzeichnis. Der Check im Repository prüft den Quellvertrag. Ein Paket-Build setzt eine vorhandene `svelte-package`-CLI voraus.
