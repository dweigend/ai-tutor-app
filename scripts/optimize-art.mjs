#!/usr/bin/env node
/**
 * Tile motif compression (issue #10, DESIGN.md §8). Reads the 1024 px masters in
 * scripts/art-masters/ and writes everything static/art/ serves:
 *
 * - static/art/<name>.webp: the master at 1024 px, re-encoded only if that makes it smaller
 *   (magazine, tutorials and tutor still link these paths).
 * - static/art/tiles/<name>-{400,800}.{avif,webp}: tile motifs at two widths for `srcset`.
 *   400 covers a phone cell (195 CSS px at DPR 2), 800 the wide phone slot (390 at DPR 2)
 *   and every desktop cell; that is twice the largest tile width this layout needs.
 *
 * Uses only the local ImageMagick 7 (`magick`, libwebp + libheif/aom). No paid service.
 * Usage: node scripts/optimize-art.mjs [--compare]
 * --compare additionally prints a WebP-vs-AVIF sweep (bytes, SSIM, grain kept) at 800 px.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MASTER_DIR = join(ROOT, 'scripts/art-masters');
const ART_DIR = join(ROOT, 'static/art');
const TILE_DIR = join(ART_DIR, 'tiles');

/** Motifs that appear as home tiles (navigation.ts `homeOffers` and the fixed tutor tile). */
const TILE_MOTIFS = [
	'uebungen',
	'tutor',
	'erklaerungen',
	'magazin',
	'whiteboard',
	'podcast',
	'aktivitaet',
	'essay-lernstand',
	'essay-tutor',
	'essay-transformer',
	'tutorial-schichten',
	'tutorial-schalttafel',
	'home-attention',
	'home-delegieren',
	'home-lernraten',
	'home-lernstand',
	'home-magazin',
	'home-schaltwerk',
	'home-sicherheit',
	'home-whiteboard'
];
const TILE_WIDTHS = [400, 800];

const AVIF_TILE_QUALITY = 52;
const WEBP_TILE_QUALITY = 60;
const MAX_TILE_QUALITY = 99;
const WEBP_MASTER_QUALITY = 65;
const TILE_BUDGET_BYTES = 60_000;
const DARK_TILE_BUDGET_BYTES = 40_000;
const DARK_MOTIFS = new Set(['tutor', 'aktivitaet', 'whiteboard']);
const MIN_GRAIN_KEPT = 0.9;
// At 800 px, the two dark photograms need mild pre-emphasis of the master's own high frequencies
// to offset codec smoothing within 40 KB. Calibrated against the unmodified downsampled masters.
const GRAIN_PRE_EMPHASIS_800 = { avif: 0.23, webp: 0.15 };
const PHOTOGRAMS = new Set(['aktivitaet', 'whiteboard']);
/** libaom speed 4: slower than the default, smaller files; deterministic for a given input. */
const AVIF_ARGS = (quality) => ['-quality', String(quality), '-define', 'heic:speed=4'];
const WEBP_ARGS = (quality) => ['-quality', String(quality), '-define', 'webp:method=6'];

const COMPARE_AVIF = [40, 52, 60];
const COMPARE_WEBP = [55, 60, 75];
/** Grain = standard deviation of the high-pass (image minus a 1.2 px blur), on grey. */
const GRAIN_BLUR = '0x1.2';

function magick(args) {
	return execFileSync('magick', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function bytes(file) {
	return statSync(file).size;
}

function encode(input, output, width, formatArgs, grainBoost = 0) {
	const resize = width ? ['-resize', `${width}x${width}`] : [];
	const sharpen = grainBoost ? ['-unsharp', `${GRAIN_BLUR}+${grainBoost}+0`] : [];
	magick([input, '-strip', ...resize, ...sharpen, ...formatArgs, output]);
}

function writeMaster(name) {
	const master = join(MASTER_DIR, `${name}.webp`);
	const target = join(ART_DIR, `${name}.webp`);
	encode(master, target, undefined, WEBP_ARGS(WEBP_MASTER_QUALITY));
	// A re-encode that does not shrink the file only loses quality: keep the master as it is.
	if (bytes(target) >= bytes(master)) copyFileSync(master, target);
	return { before: bytes(master), after: bytes(target) };
}

function encodeTile(input, output, options) {
	const { width, startQuality, formatArgs, budget, referenceGrain, grainBoost } = options;
	let step = 1;
	for (let quality = startQuality; quality >= 1 && quality <= MAX_TILE_QUALITY; quality += step) {
		encode(input, output, width, formatArgs(quality), grainBoost);
		const size = bytes(output);
		if (size > budget) {
			if (quality === startQuality) step = -1;
			if (step === 1) break;
			continue;
		}
		const grainKept = grain(output) / referenceGrain;
		if (grainKept >= MIN_GRAIN_KEPT) return { size, quality, grainKept };
	}
	throw new Error(
		`${basename(output)}: no tested quality meets ${budget} B and ${MIN_GRAIN_KEPT * 100}% grain`
	);
}

function writeTile(name, workDir) {
	const master = join(MASTER_DIR, `${name}.webp`);
	const budget = DARK_MOTIFS.has(name) ? DARK_TILE_BUDGET_BYTES : TILE_BUDGET_BYTES;
	const sizes = {};
	for (const width of TILE_WIDTHS) {
		const reference = join(workDir, `${name}-${width}-ref.png`);
		encode(master, reference, width, []);
		const referenceGrain = grain(reference);
		const boost = width === 800 && PHOTOGRAMS.has(name) ? GRAIN_PRE_EMPHASIS_800 : {};
		const variants = [
			{ format: 'avif', startQuality: AVIF_TILE_QUALITY, formatArgs: AVIF_ARGS },
			{ format: 'webp', startQuality: WEBP_TILE_QUALITY, formatArgs: WEBP_ARGS }
		];
		for (const { format, startQuality, formatArgs } of variants) {
			const output = join(workDir, `${name}-${width}.${format}`);
			const result = encodeTile(master, output, {
				width,
				startQuality,
				formatArgs,
				budget,
				referenceGrain,
				grainBoost: boost[format]
			});
			sizes[`${format}${width}`] =
				`${result.size} (q${result.quality}, ${(result.grainKept * 100).toFixed(1)} %)`;
		}
	}
	return sizes;
}

function ssim(reference, candidate) {
	// `compare` prints "<absolute> (<normalised distortion>)" on stderr and exits 1 on difference.
	let output = '';
	try {
		output = magick(['compare', '-metric', 'SSIM', reference, candidate, 'null:']);
	} catch (error) {
		output = String(error.stderr);
	}
	const distortion = Number(/\(([\d.e-]+)\)/.exec(output)?.[1]);
	if (!Number.isFinite(distortion)) throw new Error(`Unreadable SSIM output: ${output}`);
	return 1 - distortion;
}

function grain(file) {
	const args = [file, '-colorspace', 'gray', '(', '+clone', '-blur', GRAIN_BLUR, ')'];
	return Number(
		magick([
			...args,
			'-compose',
			'minus',
			'-composite',
			'-format',
			'%[fx:standard_deviation]',
			'info:'
		])
	);
}

function compareFormats(name, workDir) {
	const reference = join(workDir, `${name}-ref.png`);
	encode(join(MASTER_DIR, `${name}.webp`), reference, 800, []);
	const referenceGrain = grain(reference);
	const candidates = [
		...COMPARE_WEBP.map((quality) => ({ format: 'webp', quality, args: WEBP_ARGS(quality) })),
		...COMPARE_AVIF.map((quality) => ({ format: 'avif', quality, args: AVIF_ARGS(quality) }))
	];
	return candidates.map(({ format, quality, args }) => {
		const file = join(workDir, `${name}-q${quality}.${format}`);
		encode(reference, file, undefined, args);
		return {
			name,
			format,
			quality,
			bytes: bytes(file),
			ssim: ssim(reference, file),
			grainKept: grain(file) / referenceGrain
		};
	});
}

function kb(value) {
	return (value / 1024).toFixed(1);
}

function printTables(masters, tiles) {
	console.log('| Motiv | vorher (B) | 1024 WebP (B) | 400 AVIF | 800 AVIF | 400 WebP | 800 WebP |');
	console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
	for (const [name, master] of Object.entries(masters)) {
		const tile = tiles[name];
		const cells = tile
			? [tile.avif400, tile.avif800, tile.webp400, tile.webp800]
			: ['–', '–', '–', '–'];
		console.log(`| ${name} | ${master.before} | ${master.after} | ${cells.join(' | ')} |`);
	}
	const before = Object.values(masters).reduce((sum, master) => sum + master.before, 0);
	const after = Object.values(masters).reduce((sum, master) => sum + master.after, 0);
	console.log(`\n1024 masters: ${kb(before)} KB -> ${kb(after)} KB`);
}

function printComparison(rows) {
	console.log('\n| Motiv | Format | q | KB | SSIM | Körnung erhalten |');
	console.log('| --- | --- | ---: | ---: | ---: | ---: |');
	for (const row of rows) {
		const grainPercent = (row.grainKept * 100).toFixed(1);
		console.log(
			`| ${row.name} | ${row.format} | ${row.quality} | ${kb(row.bytes)} | ${row.ssim.toFixed(4)} | ${grainPercent} % |`
		);
	}
}

function main() {
	const names = readdirSync(MASTER_DIR)
		.filter((file) => file.endsWith('.webp'))
		.map((file) => basename(file, '.webp'))
		.sort();
	const missing = TILE_MOTIFS.filter((name) => !names.includes(name));
	if (missing.length > 0) throw new Error(`Tile motifs without master: ${missing.join(', ')}`);

	const workDir = mkdtempSync(join(tmpdir(), 'optimize-art-'));
	try {
		const tiles = Object.fromEntries(TILE_MOTIFS.map((name) => [name, writeTile(name, workDir)]));
		const masters = Object.fromEntries(names.map((name) => [name, writeMaster(name)]));
		rmSync(TILE_DIR, { recursive: true, force: true });
		mkdirSync(TILE_DIR, { recursive: true });
		for (const file of readdirSync(workDir).filter((file) => /\.(avif|webp)$/.test(file))) {
			copyFileSync(join(workDir, file), join(TILE_DIR, file));
		}
		printTables(masters, tiles);
		if (process.argv.includes('--compare')) {
			printComparison(TILE_MOTIFS.flatMap((name) => compareFormats(name, workDir)));
		}
	} finally {
		rmSync(workDir, { recursive: true, force: true });
	}
}

main();
