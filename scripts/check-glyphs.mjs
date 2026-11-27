#!/usr/bin/env node
/**
 * DESIGN.md §6.7 · cmap scan. Every character above ASCII in src/lib/content/*.ts must be in the
 * cmap of an app font: Archivo (latin + latin-ext), the one voice of the interface, or JetBrains
 * Mono, the code voice of `[data-code]`. Where a content string is set is not known statically,
 * so a character found in one font only is listed as a note: a character Archivo lacks (e.g. η)
 * may stand in formulas and code only (§6.5). The browser font test (CDP) checks it per node.
 * Reads the three local WOFF2 files directly (Node zlib brotli, no dependencies).
 * Exit 0: no missing character beyond the allowlist. Exit 1: any new missing character, or an
 * allowlist entry that is no longer needed (so the list only shrinks).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_DIR = join(ROOT, 'src/lib/content');
const FONT_DIR = join(ROOT, 'static/fonts');

const VOICES = {
	Archivo: ['archivo-latin.woff2', 'archivo-latin-ext.woff2'],
	'JetBrains Mono': ['jetbrains-mono-var.woff2']
};
const ALLOWLIST = new Map();

// WOFF2 known-table index (W3C WOFF2 §5.1), used when a directory entry has no explicit tag.
const KNOWN_TAGS = [
	'cmap',
	'head',
	'hhea',
	'hmtx',
	'maxp',
	'name',
	'OS/2',
	'post',
	'cvt ',
	'fpgm',
	'glyf',
	'loca',
	'prep',
	'CFF ',
	'VORG',
	'EBDT',
	'EBLC',
	'gasp',
	'hdmx',
	'kern',
	'LTSH',
	'PCLT',
	'VDMX',
	'vhea',
	'vmtx',
	'BASE',
	'GDEF',
	'GPOS',
	'GSUB',
	'EBSC',
	'JSTF',
	'MATH',
	'CBDT',
	'CBLC',
	'COLR',
	'CPAL',
	'SVG ',
	'sbix',
	'acnt',
	'avar',
	'bdat',
	'bloc',
	'bsln',
	'cvar',
	'fdsc',
	'feat',
	'fmtx',
	'fvar',
	'gvar',
	'hsty',
	'just',
	'lcar',
	'mort',
	'morx',
	'opbd',
	'prop',
	'trak',
	'Zapf',
	'Silf',
	'Glat',
	'Gloc',
	'Feat',
	'Sill'
];

function readBase128(view, state) {
	let value = 0;
	for (let i = 0; i < 5; i++) {
		const byte = view.getUint8(state.offset++);
		value = (value << 7) | (byte & 0x7f);
		if ((byte & 0x80) === 0) return value >>> 0;
	}
	throw new Error('invalid UIntBase128');
}

/** Returns the raw cmap table of a WOFF2 file (cmap is never transformed). */
function woff2Cmap(path) {
	const bytes = readFileSync(path);
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (view.getUint32(0) !== 0x774f4632) throw new Error(`${path}: not a WOFF2 file`);
	const numTables = view.getUint16(12);
	const compressedLength = view.getUint32(20);
	const state = { offset: 48 };
	let streamOffset = 0;
	let cmap;
	for (let i = 0; i < numTables; i++) {
		const flags = view.getUint8(state.offset++);
		let tag;
		if ((flags & 0x3f) === 0x3f) {
			tag = String.fromCharCode(...bytes.subarray(state.offset, state.offset + 4));
			state.offset += 4;
		} else {
			tag = KNOWN_TAGS[flags & 0x3f];
		}
		const version = (flags >> 6) & 0x03;
		const origLength = readBase128(view, state);
		// glyf/loca are transformed at version 0, every other table at a non-zero version.
		const transformed = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0;
		const length = transformed ? readBase128(view, state) : origLength;
		if (tag === 'cmap') cmap = { offset: streamOffset, length };
		streamOffset += length;
	}
	if (!cmap) throw new Error(`${path}: no cmap table`);
	// Collections (flavor 'ttcf') are not used here; the stream starts right after the directory.
	const stream = brotliDecompressSync(
		bytes.subarray(state.offset, state.offset + compressedLength)
	);
	return stream.subarray(cmap.offset, cmap.offset + cmap.length);
}

/** Code points covered by the Unicode subtables (format 4 and 12) of a cmap. */
function cmapCodePoints(table) {
	const view = new DataView(table.buffer, table.byteOffset, table.byteLength);
	const points = new Set();
	const numSubtables = view.getUint16(2);
	for (let i = 0; i < numSubtables; i++) {
		const platform = view.getUint16(4 + i * 8);
		const encoding = view.getUint16(6 + i * 8);
		const offset = view.getUint32(8 + i * 8);
		const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
		if (!unicode) continue;
		const format = view.getUint16(offset);
		if (format === 4) {
			const segCount = view.getUint16(offset + 6) / 2;
			const ends = offset + 14;
			const starts = ends + segCount * 2 + 2;
			const deltas = starts + segCount * 2;
			const rangeOffsets = deltas + segCount * 2;
			for (let s = 0; s < segCount; s++) {
				const end = view.getUint16(ends + s * 2);
				const start = view.getUint16(starts + s * 2);
				const delta = view.getUint16(deltas + s * 2);
				const rangeOffset = view.getUint16(rangeOffsets + s * 2);
				for (let code = start; code <= end && code !== 0xffff; code++) {
					let glyph;
					if (rangeOffset === 0) glyph = (code + delta) & 0xffff;
					else {
						const at = rangeOffsets + s * 2 + rangeOffset + (code - start) * 2;
						glyph = view.getUint16(at);
						if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
					}
					if (glyph !== 0) points.add(code);
				}
			}
		} else if (format === 12) {
			const groups = view.getUint32(offset + 12);
			for (let g = 0; g < groups; g++) {
				const at = offset + 16 + g * 12;
				const start = view.getUint32(at);
				const end = view.getUint32(at + 4);
				const startGlyph = view.getUint32(at + 8);
				for (let code = start; code <= end; code++) {
					if (startGlyph + (code - start) !== 0) points.add(code);
				}
			}
		}
	}
	return points;
}

function fontPoints(file) {
	const points = cmapCodePoints(woff2Cmap(join(FONT_DIR, file)));
	if (points.size === 0) throw new Error(`${file}: empty cmap`);
	return points;
}

const hex = (code) => `U+${code.toString(16).toUpperCase().padStart(4, '0')}`;

const voices = Object.entries(VOICES).map(([name, files]) => {
	const points = new Set();
	for (const file of files) for (const code of fontPoints(file)) points.add(code);
	return { name, points };
});

/** code point → { char, places: ["file:line"], count } */
const found = new Map();
for (const file of readdirSync(CONTENT_DIR)
	.filter((name) => name.endsWith('.ts'))
	.sort()) {
	const path = join(CONTENT_DIR, file);
	const lines = readFileSync(path, 'utf8').split('\n');
	lines.forEach((line, index) => {
		for (const char of line) {
			const code = char.codePointAt(0);
			if (code <= 0x7f) continue;
			const entry = found.get(code) ?? { char, places: [], count: 0 };
			entry.count++;
			const place = `${relative(ROOT, path)}:${index + 1}`;
			if (!entry.places.includes(place)) entry.places.push(place);
			found.set(code, entry);
		}
	});
}

const failures = [];
const allowed = [];
const oneVoice = [];
for (const [code, entry] of [...found].sort(([a], [b]) => a - b)) {
	const missingIn = voices.filter((voice) => !voice.points.has(code)).map((voice) => voice.name);
	if (missingIn.length === 0) continue;
	const where = entry.places.slice(0, 3).join(', ') + (entry.places.length > 3 ? ', …' : '');
	const line = `${hex(code)} ${entry.char} ×${entry.count} fehlt in ${missingIn.join(' + ')} · ${where}`;
	if (missingIn.length < voices.length) oneVoice.push(`  ${line}`);
	else if (ALLOWLIST.has(code)) allowed.push(`  ${line} · Übergang ${ALLOWLIST.get(code)}`);
	else failures.push(`  ${line}`);
}
const stale = [...ALLOWLIST.keys()].filter(
	(code) => !found.has(code) || voices.some((voice) => voice.points.has(code))
);

console.log(
	`check:glyphs · ${found.size} Zeichen über ASCII in src/lib/content · Schriften: ${voices
		.map((voice) => `${voice.name} (${voice.points.size})`)
		.join(', ')}`
);
if (oneVoice.length > 0) {
	console.log(
		'Hinweis, nur in einer Schrift. Fehlt es in Archivo: nur in Formel oder Code setzen:'
	);
	console.log(oneVoice.join('\n'));
}
console.log(`Übergangs-Allowlist · ${allowed.length} Altlasten`);
if (allowed.length > 0) console.log(allowed.join('\n'));
if (stale.length > 0) {
	console.error(
		`Allowlist-Einträge nicht mehr nötig, bitte streichen: ${stale.map(hex).join(', ')}`
	);
}
if (failures.length > 0) {
	console.error(`FEHLER: ${failures.length} Zeichen ohne cmap-Eintrag (§6.7):`);
	console.error(failures.join('\n'));
}
if (failures.length > 0 || stale.length > 0) process.exit(1);
console.log('OK: kein neues Zeichen ohne cmap-Eintrag.');
