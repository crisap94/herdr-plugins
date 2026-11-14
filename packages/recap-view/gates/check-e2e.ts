import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export interface Entry {
    readonly key: string;
    readonly file: string;
}

export interface Report {
    readonly notes: readonly string[];
    readonly findings: readonly string[];
}

type Fields = Readonly<Record<string, unknown>>;

const SOURCE_FILE = /\.(ts|mts|cts|tsx|mjs|cjs|js)$/;
const BUILTIN = /^(node|bun):/;
const CONDITIONS = ['bun', 'import', 'default'];
const E2E = 'test/e2e/';
const EXEMPT = 'test/gates/';

const isFields = (input: unknown): input is Fields => typeof input === 'object' && input !== null && !Array.isArray(input);

const fieldsOf = (path: string): Fields => {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return isFields(parsed) ? parsed : {};
};

const filesUnder = (root: string, folder: string): readonly string[] => {
    const start = join(root, folder);
    if (!existsSync(start)) {
        return [];
    }
    return readdirSync(start, { recursive: true, encoding: 'utf8' })
        .filter((name) => SOURCE_FILE.test(name) && !name.endsWith('.d.ts') && !name.split('/').includes('node_modules'))
        .map((name) => join(folder, name))
        .toSorted();
};

const targetOf = (value: unknown): string | null => {
    if (typeof value === 'string') {
        return value;
    }
    const found = isFields(value) ? CONDITIONS.map((name) => value[name]).find((item) => typeof item === 'string') : undefined;
    return typeof found === 'string' ? found : null;
};

const exportsOf = (manifest: Fields): ReadonlyMap<string, string> => {
    const map = manifest.exports;
    if (typeof map === 'string') {
        return new Map([['.', map]]);
    }
    if (!isFields(map)) {
        return new Map();
    }
    return new Map(Object.entries(map).flatMap(([key, value]) => {
        const target = targetOf(value);
        return target === null ? [] : [[key, target] as const];
    }));
};

const wildcardEntries = (root: string, key: string, target: string): readonly Entry[] => {
    const [prefix = '', suffix = ''] = target.replace(/^\.\//, '').split('*');
    const folder = prefix.includes('/') ? prefix.slice(0, prefix.lastIndexOf('/')) : '.';
    return filesUnder(root, folder)
        .map((file) => relative('.', file))
        .filter((file) => file.startsWith(prefix) && file.endsWith(suffix) && file.length >= prefix.length + suffix.length)
        .map((file) => ({ key: key.replace('*', file.slice(prefix.length, file.length - suffix.length)), file }));
};

export const entriesOf = (root: string, notes: string[]): readonly Entry[] =>
    [...exportsOf(fieldsOf(join(root, 'package.json')))].flatMap(([key, target]) => {
        const file = target.replace(/^\.\//, '');
        if (key.includes('*')) {
            const found = wildcardEntries(root, key, target);
            if (found.length === 0) {
                notes.push(`skip ${key}: no file matches ${target} yet`);
            }
            return found;
        }
        if (!existsSync(join(root, file)) || !SOURCE_FILE.test(file)) {
            notes.push(`skip ${key}: ${target} is not a source file yet`);
            return [];
        }
        return [{ key, file }];
    });

const optionsOf = (root: string): ts.CompilerOptions => {
    const path = join(root, 'tsconfig.json');
    const fallback: ts.CompilerOptions = { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, allowImportingTsExtensions: true, noEmit: true, strict: true };
    if (!existsSync(path)) {
        return fallback;
    }
    const config = ts.readConfigFile(path, (file) => ts.sys.readFile(file));
    return config.error === undefined ? ts.parseJsonConfigFileContent(config.config, ts.sys, root).options : fallback;
};

const original = (checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol =>
    (symbol.flags & ts.SymbolFlags.Alias) === 0 ? symbol : checker.getAliasedSymbol(symbol);

const runtimeExports = (checker: ts.TypeChecker, file: ts.SourceFile): ReadonlyMap<string, ts.Symbol> => {
    const module = checker.getSymbolAtLocation(file);
    if (module === undefined) {
        return new Map();
    }
    return new Map(checker.getExportsOfModule(module).flatMap((symbol) => {
        const target = original(checker, symbol);
        return (target.flags & ts.SymbolFlags.Value) === 0 ? [] : [[symbol.name, target] as const];
    }));
};

const skipped = (node: ts.Node): boolean =>
    ts.isTypeNode(node) || ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isImportEqualsDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node);

const usedIn = (checker: ts.TypeChecker, file: ts.SourceFile, used: Set<ts.Symbol>): void => {
    const visit = (node: ts.Node): void => {
        if (skipped(node)) {
            return;
        }
        if (ts.isIdentifier(node)) {
            const symbol = checker.getSymbolAtLocation(node);
            if (symbol !== undefined) {
                used.add(original(checker, symbol));
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(file);
};

export const coverageOf = (root: string, entries: readonly Entry[], notes: string[]): readonly string[] => {
    const tests = filesUnder(root, 'test/e2e');
    const program = ts.createProgram({ rootNames: [...entries.map((entry) => join(root, entry.file)), ...tests.map((file) => join(root, file))], options: optionsOf(root) });
    const checker = program.getTypeChecker();
    const used = new Set<ts.Symbol>();
    tests.forEach((file) => {
        const source = program.getSourceFile(join(root, file));
        if (source !== undefined) {
            usedIn(checker, source, used);
        }
    });
    const counted = entries.map((entry) => {
        const source = program.getSourceFile(join(root, entry.file));
        const values = source === undefined ? new Map<string, ts.Symbol>() : runtimeExports(checker, source);
        notes.push(`entry ${entry.key} (${entry.file}): ${values.size} runtime value(s)`);
        return { entry, values };
    });
    if (counted.every(({ values }) => values.size === 0)) {
        notes.push(`no entry point exports a runtime value yet: ${E2E} has nothing to cover`);
    }
    return counted.flatMap(({ entry, values }) =>
        [...values].filter(([, symbol]) => !used.has(symbol)).map(([name]) => `uncovered: ${entry.key} ${name} (${entry.file}) is used by no test under ${E2E}`));
};

const lineOf = (text: string, position: number): number => text.slice(0, position).split('\n').length;

const packageName = (text: string): string => text.split('/').slice(0, text.startsWith('@') ? 2 : 1).join('/');

const declares = (manifest: Fields, text: string): boolean => {
    const name = manifest.name;
    if (typeof name !== 'string' || packageName(text) !== name) {
        return false;
    }
    const key = text === name ? '.' : `.${text.slice(name.length)}`;
    return [...exportsOf(manifest).keys()].some((pattern) => {
        const [prefix = '', suffix = ''] = pattern.split('*');
        return pattern.includes('*') ? key.startsWith(prefix) && key.endsWith(suffix) && key.length > prefix.length + suffix.length : pattern === key;
    });
};

export interface Scope {
    readonly root: string;
    readonly manifest: Fields;
    readonly units: ReadonlyMap<string, Fields>;
    readonly declared: readonly string[];
}

const aliasTarget = (manifest: Fields, text: string): string | null => {
    const map = manifest.imports;
    if (!isFields(map)) {
        return null;
    }
    const hit = Object.entries(map).find(([pattern]) => (pattern.includes('*') ? text.startsWith(pattern.slice(0, pattern.indexOf('*'))) : pattern === text));
    const target = hit === undefined ? null : targetOf(hit[1]);
    return hit === undefined || target === null ? null : target.replace('*', text.slice(hit[0].indexOf('*')));
};

const insideTest = (scope: Scope, path: string): boolean => !relative(join(scope.root, 'test'), path).startsWith('..');

const allowed = (scope: Scope, file: string, text: string): boolean => {
    if (BUILTIN.test(text)) {
        return true;
    }
    if (text.startsWith('.')) {
        return insideTest(scope, resolve(scope.root, dirname(file), text));
    }
    if (text.startsWith('#')) {
        const target = aliasTarget(scope.manifest, text);
        return target !== null && insideTest(scope, resolve(scope.root, target));
    }
    const unit = scope.units.get(packageName(text));
    if (unit !== undefined) {
        return declares(unit, text);
    }
    return scope.declared.includes(packageName(text));
};

export const importsOf = (scope: Scope): readonly string[] =>
    filesUnder(scope.root, 'test')
        .filter((file) => !file.startsWith(EXEMPT))
        .flatMap((file) => {
            const text = readFileSync(join(scope.root, file), 'utf8');
            return ts.preProcessFile(text, true, true).importedFiles
                .filter((imported) => !allowed(scope, file, imported.fileName))
                .map((imported) => `private import: ${file}:${lineOf(text, imported.pos)}: ${imported.fileName} is not a public entry point, a built-in, a declared dependency or a file under test/`);
        });

const workspaceOf = (root: string): string | null => {
    const parent = dirname(root);
    if (parent === root) {
        return null;
    }
    const manifest = join(parent, 'package.json');
    return existsSync(manifest) && 'workspaces' in fieldsOf(manifest) ? parent : workspaceOf(parent);
};

const unitsOf = (root: string): ReadonlyMap<string, Fields> => {
    const top = workspaceOf(root);
    const folders = top === null ? [root] : ['.', 'packages'].flatMap((parent) => (existsSync(join(top, parent)) ? readdirSync(join(top, parent)).map((name) => join(top, parent, name)) : []));
    return new Map([...folders, root].filter((folder) => existsSync(join(folder, 'package.json'))).flatMap((folder) => {
        const manifest = fieldsOf(join(folder, 'package.json'));
        return typeof manifest.name === 'string' ? [[manifest.name, manifest] as const] : [];
    }));
};

export const scopeOf = (root: string): Scope => {
    const manifest = fieldsOf(join(root, 'package.json'));
    const names = ['dependencies', 'devDependencies'].flatMap((field) => {
        const value = manifest[field];
        return isFields(value) ? Object.keys(value) : [];
    });
    return { root, manifest, units: unitsOf(root), declared: names };
};

export const checkE2e = (root: string): Report => {
    const notes: string[] = [];
    const entries = entriesOf(root, notes);
    const findings = [...coverageOf(root, entries, notes), ...importsOf(scopeOf(root))];
    return { notes, findings };
};

const rootOf = (args: readonly string[]): string => {
    const at = args.indexOf('--root');
    const given = at === -1 ? undefined : args[at + 1];
    return given === undefined ? join(dirname(fileURLToPath(import.meta.url)), '..') : resolve(given);
};

if (import.meta.main) {
    const root = rootOf(process.argv.slice(2));
    if (!existsSync(join(root, 'package.json'))) {
        console.error(`e2e: 3 — NOT COVERED: no package.json at ${root}`);
        process.exit(3);
    }
    const report = checkE2e(root);
    report.notes.forEach((note) => console.log(`  ${note}`));
    report.findings.forEach((finding) => console.error(`  ${finding}`));
    console.log(report.findings.length === 0 ? 'e2e: clean' : `e2e: ${report.findings.length} finding(s)`);
    process.exitCode = report.findings.length === 0 ? 0 : 1;
}
