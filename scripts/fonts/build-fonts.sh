#!/usr/bin/env bash
# Rebuilds the self-hosted WOFF2 files in ui/static/fonts from the upstream sources.
# Not part of `npm run build`: the WOFF2 files are committed. Run manually after a change of
# the character ranges below and update ui/static/fonts/README.md.
# Needs: curl, uvx (uv). Costs nothing: all sources are public GitHub files.
set -euo pipefail

UI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="$UI_DIR/static/fonts"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

FONTTOOLS=(uvx --from fonttools --with brotli)

# Upstream sources. The SHA-256 of each download is recorded in ui/static/fonts/README.md.
ARCHIVO_URL='https://github.com/google/fonts/raw/main/ofl/archivo/Archivo%5Bwdth,wght%5D.ttf'
JBM_URL='https://github.com/google/fonts/raw/main/ofl/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf'

# Google Fonts' "latin" and "latin-ext" ranges, plus the typographic extras the contract uses.
LATIN='U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2190-2199,U+2212,U+2215,U+FEFF,U+FFFD'
LATIN_EXT='U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'
MATH='U+2070-209F,U+2200-22FF'
# Code voice only: Greek variable names (η, σ) and box, block and geometric shapes (■ ━ ░ ▓).
GREEK='U+0370-03FF'
SHAPES='U+2500-257F,U+2580-259F,U+25A0-25FF'

# No icon font: signs are SVG icons from src/lib/modules/core/icons.ts (DESIGN.md §7).

curl -sSLf -o "$WORK_DIR/archivo.ttf" "$ARCHIVO_URL"
curl -sSLf -o "$WORK_DIR/jbm.ttf" "$JBM_URL"
(cd "$WORK_DIR" && sha256sum archivo.ttf jbm.ttf)

subset() { # in out unicodes
	"${FONTTOOLS[@]}" pyftsubset "$1" --output-file="$2" --unicodes="$3" \
		--flavor=woff2 --layout-features='*' --name-IDs='*' --no-hinting --desubroutinize
}

# Archivo: keep only the axis span the UI uses (weight 300–700, width 85–125 %).
"${FONTTOOLS[@]}" fonttools varLib.instancer "$WORK_DIR/archivo.ttf" wght=300:700 wdth=85:125 \
	-o "$WORK_DIR/archivo-cut.ttf"
# Two files like Google Fonts: German needs only "latin" (ä ö ü ß are Latin-1), so the
# preloaded file stays small; "latin-ext" loads only when a page uses such a character.
subset "$WORK_DIR/archivo-cut.ttf" "$OUT_DIR/archivo-latin.woff2" "$LATIN,$MATH"
subset "$WORK_DIR/archivo-cut.ttf" "$OUT_DIR/archivo-latin-ext.woff2" "$LATIN_EXT"

# JetBrains Mono: weight 400–700; the code voice sets 400 (DESIGN.md §6.2).
"${FONTTOOLS[@]}" fonttools varLib.instancer "$WORK_DIR/jbm.ttf" wght=400:700 -o "$WORK_DIR/jbm-cut.ttf"
subset "$WORK_DIR/jbm-cut.ttf" "$OUT_DIR/jetbrains-mono-var.woff2" "$LATIN,$LATIN_EXT,$MATH,$GREEK,$SHAPES"

# Code points per file: the unicode-range values in src/lib/styles/fonts.css mirror this list,
# so a face never claims a character it does not have (e.g. Archivo has no ↗).
uvx --from fonttools --with brotli python -I - "$OUT_DIR"/archivo-*.woff2 <<'PY'
import sys
from fontTools.ttLib import TTFont
for path in sys.argv[1:]:
    ranges = []
    for cp in sorted(TTFont(path).getBestCmap()):
        if ranges and cp == ranges[-1][1] + 1:
            ranges[-1][1] = cp
        else:
            ranges.append([cp, cp])
    text = ', '.join(f'U+{a:04X}' if a == b else f'U+{a:04X}-{b:04X}' for a, b in ranges)
    print(f'{path.rsplit("/", 1)[-1]}: {text}')
PY

ls -l "$OUT_DIR"/*.woff2
