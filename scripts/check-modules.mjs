import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'svelte/compiler';
import ts from 'typescript';

const lib = fileURLToPath(new URL('../src/lib/', import.meta.url));
const forbiddenApp = ['$app', '$lib/api', '$lib/content'];
const rules = {
	modules: [...forbiddenApp, 'gsap', 'three'],
	figures: [...forbiddenApp, 'svelte']
};
const required = [
	'SurfaceShell',
	'ProgressDots',
	'StatusSignal',
	'TypeBadge',
	'InteractionStage',
	'Raster',
	'Fader',
	'AxisPad',
	'Readout',
	'FigurePlate',
	'Fold',
	'BoardCanvas',
	'motion',
	'ReadAloud',
	// The one source of signs (DESIGN.md §7).
	'Icon',
	'ICONS'
];
const failures = [];

function report(file, detail) {
	failures.push(`${relative(lib, file)}: ${detail}`);
}

function* files(directory) {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const file = resolve(directory, entry.name);
		if (entry.isDirectory()) yield* files(file);
		else if (entry.isFile()) yield file;
	}
}

function sourceFile(file, source) {
	return ts.createSourceFile(
		file,
		source,
		ts.ScriptTarget.Latest,
		true,
		file.endsWith('.svelte') ? ts.ScriptKind.TS : undefined
	);
}

function scripts(file, source) {
	if (!file.endsWith('.svelte')) return [source];
	const { instance, module, fragment } = parse(source, { modern: true });
	const slices = [instance, module]
		.filter(Boolean)
		.map(({ content }) => source.slice(content.start, content.end));

	// The Svelte compiler returns ESTree expressions in the template. Visit its nodes
	// directly so calls nested in attributes, blocks, and directives are all checked.
	function visit(node) {
		if (!node || typeof node !== 'object') return;
		switch (node.type) {
			case 'ImportExpression':
				slices.push(source.slice(node.start, node.end));
				break;
			case 'CallExpression':
				if (node.callee.type === 'Identifier' && node.callee.name === 'require')
					slices.push(source.slice(node.start, node.end));
				break;
			case 'TSImportType':
				slices.push(`type Import = ${source.slice(node.start, node.end)}`);
				break;
		}
		for (const child of Object.values(node)) visit(child);
	}
	visit(fragment);
	return slices;
}

function moduleSpecifier(node) {
	if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return node.moduleSpecifier;
	if (ts.isExternalModuleReference(node)) return node.expression;
	if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
		return node.argument.literal;
	if (!ts.isCallExpression(node)) return;
	const callee = node.expression;
	if (
		callee.kind === ts.SyntaxKind.ImportKeyword ||
		(ts.isIdentifier(callee) && callee.text === 'require')
	) {
		return node.arguments[0];
	}
}

function checkSpecifier(file, specifier, forbidden) {
	const path = specifier.startsWith('.')
		? `$lib/${relative(lib, resolve(dirname(file), specifier))}`
		: specifier;
	if (forbidden.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
		report(file, `verbotener Import ${specifier}`);
	}
}

function checkScript(file, script, forbidden) {
	function visit(node) {
		const specifier = moduleSpecifier(node);
		if (specifier && ts.isStringLiteralLike(specifier)) {
			checkSpecifier(file, specifier.text, forbidden);
		}
		ts.forEachChild(node, visit);
	}
	visit(sourceFile(file, script));
}

function checkImports(folder, forbidden) {
	for (const file of files(resolve(lib, folder))) {
		if (!/\.(svelte|[cm]?[jt]sx?|css)$/.test(file)) continue;
		const source = readFileSync(file, 'utf8');
		try {
			if (file.endsWith('.css')) {
				for (const [, specifier] of source.matchAll(/@import\s+(?:url\(\s*)?['"]([^'"]+)['"]/g)) {
					checkSpecifier(file, specifier, forbidden);
				}
			} else {
				for (const script of scripts(file, source)) checkScript(file, script, forbidden);
			}
		} catch (error) {
			report(file, error.message);
		}
	}
}

function checkExports(file) {
	const exports = new Set();
	const ast = sourceFile(file, readFileSync(file, 'utf8'));
	for (const node of ast.statements) {
		if (!ts.isExportDeclaration(node) || node.isTypeOnly || !node.exportClause) continue;
		const { moduleSpecifier, exportClause } = node;
		if (
			moduleSpecifier &&
			ts.isStringLiteral(moduleSpecifier) &&
			moduleSpecifier.text.startsWith('.')
		) {
			const target = resolve(dirname(file), moduleSpecifier.text);
			if (!existsSync(target) && !existsSync(target.replace(/\.js$/, '.ts'))) {
				report(file, `Exportziel fehlt: ${moduleSpecifier.text}`);
				continue;
			}
		}
		if (ts.isNamespaceExport(exportClause)) exports.add(exportClause.name.text);
		else
			for (const entry of exportClause.elements)
				if (!entry.isTypeOnly) exports.add(entry.name.text);
	}
	for (const name of required) {
		if (!exports.has(name)) report(file, `Export fehlt: ${name}`);
	}
}

for (const [folder, forbidden] of Object.entries(rules)) checkImports(folder, forbidden);
checkExports(resolve(lib, 'modules/index.ts'));

if (failures.length) {
	console.error(failures.join('\n'));
	process.exitCode = 1;
} else {
	console.log('OK: Modulgrenzen, Primitive, Indikatoren, Dienste und Icon-Set geprüft.');
}
