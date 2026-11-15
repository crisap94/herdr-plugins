import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export interface HostSettings {
    readonly domain: string;
    readonly hostTypes: string;
    readonly hostModules: readonly string[];
}

export interface ModFile {
    readonly path: string;
    readonly text: string;
}

const MOD_FILE = /\.(js|mjs)$/u;

const leavesMod = (file: ModFile, specifier: string): boolean => {
    const own = file.path.split('/').slice(0, 2).join('/');
    return relative(own, join(dirname(file.path), specifier)).startsWith('..');
};

export const specifierProblems = (file: ModFile, settings: HostSettings): readonly string[] =>
    ts.preProcessFile(file.text, true, true).importedFiles.flatMap(({ fileName }) => {
        if (fileName.startsWith('.')) {
            return leavesMod(file, fileName) ? [`${file.path}: ${fileName} leaves the folder of its mod`] : [];
        }
        return settings.hostModules.includes(fileName) ? [] : [`${file.path}: ${fileName} is neither relative nor a host module (gates/config.json hostModules)`];
    });

const bindingNames = (clause: ts.ImportClause): readonly string[] => {
    const bindings = clause.namedBindings;
    const named = bindings !== undefined && ts.isNamedImports(bindings) ? bindings.elements.map((element) => (element.propertyName ?? element.name).text) : [];
    const namespace = bindings !== undefined && ts.isNamespaceImport(bindings) ? ['*'] : [];
    const fallback = clause.name === undefined ? [] : ['default'];
    return [...fallback, ...named, ...namespace];
};

const hostImportsOf = (file: ModFile, settings: HostSettings): readonly string[] =>
    ts
        .createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true)
        .statements.filter(ts.isImportDeclaration)
        .flatMap((statement) => {
            const from = ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : '';
            const clause = statement.importClause;
            return settings.hostModules.includes(from) && clause !== undefined ? bindingNames(clause).map((name) => `${from}:${name}`) : [];
        });

export const importedHostNames = (files: readonly ModFile[], settings: HostSettings): ReadonlySet<string> => new Set(files.flatMap((file) => hostImportsOf(file, settings)));

export const declaredHostNames = (text: string): ReadonlySet<string> => {
    const source = ts.createSourceFile('host.d.ts', text, ts.ScriptTarget.Latest, true);
    return new Set(
        source.statements.filter(ts.isModuleDeclaration).flatMap((declaration) => {
            const body = declaration.body;
            if (body === undefined || !ts.isModuleBlock(body)) {
                return [];
            }
            return body.statements
                .filter(ts.isVariableStatement)
                .flatMap((statement) => statement.declarationList.declarations.map((variable) => `${declaration.name.text}:${variable.name.getText(source)}`));
        }),
    );
};

export const hostTypeProblems = (imported: ReadonlySet<string>, declared: ReadonlySet<string>, hostTypes: string): readonly string[] => [
    ...[...imported].filter((name) => !declared.has(name)).toSorted().map((name) => `${hostTypes}: ${name} is imported by a mod and not declared`),
    ...[...declared].filter((name) => !imported.has(name)).toSorted().map((name) => `${hostTypes}: ${name} is declared and no mod imports it`),
];

type Fields = Readonly<Record<string, unknown>>;

const isFields = (input: unknown): input is Fields => typeof input === 'object' && input !== null && !Array.isArray(input);

const textsOf = (input: unknown): readonly string[] => (Array.isArray(input) ? input.filter((item: unknown): item is string => typeof item === 'string') : []);

const textOf = (input: unknown, fallback: string): string => (typeof input === 'string' ? input : fallback);

export const settingsOf = (root: string): HostSettings => {
    const parsed: unknown = JSON.parse(readFileSync(join(root, 'gates/config.json'), 'utf8'));
    const config = isFields(parsed) ? parsed : {};
    return { domain: textOf(config['domain'], 'mods'), hostTypes: textOf(config['hostTypes'], 'types/host.d.ts'), hostModules: textsOf(config['hostModules']) };
};

const modFilesOf = (root: string, domain: string): readonly ModFile[] =>
    readdirSync(join(root, domain), { recursive: true, encoding: 'utf8' })
        .filter((name) => MOD_FILE.test(name))
        .toSorted()
        .map((name) => ({ path: join(domain, name), text: readFileSync(join(root, domain, name), 'utf8') }));

export const checkHostImports = (root: string, settings: HostSettings): readonly string[] => {
    const files = modFilesOf(root, settings.domain);
    const declared = declaredHostNames(readFileSync(join(root, settings.hostTypes), 'utf8'));
    return [...files.flatMap((file) => specifierProblems(file, settings)), ...hostTypeProblems(importedHostNames(files, settings), declared, settings.hostTypes)];
};

if (import.meta.main) {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const problems = checkHostImports(root, settingsOf(root));
    problems.forEach((problem) => console.error(`  ${problem}`));
    console.log(problems.length === 0 ? 'host imports: clean' : `host imports: ${problems.length} finding(s)`);
    process.exitCode = problems.length === 0 ? 0 : 1;
}
