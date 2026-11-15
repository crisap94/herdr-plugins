import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export interface Boundaries {
    readonly source: readonly string[];
    readonly domain: string;
    readonly builtins: readonly string[];
    readonly declaredAhead: readonly string[];
    readonly dependencies: readonly string[];
    readonly units: readonly string[];
}

interface Specifier {
    readonly file: string;
    readonly text: string;
}

const SOURCE_FILE = /\.(ts|mts|cts|mjs|cjs|js)$/;
const BUILTIN = /^(node|bun):/;

const filesUnder = (root: string, folder: string): readonly string[] => {
    const start = join(root, folder);
    if (!existsSync(start)) {
        return [];
    }
    return readdirSync(start, { recursive: true, encoding: 'utf8' })
        .filter((name) => SOURCE_FILE.test(name) && !name.split('/').includes('probes') && !name.split('/').includes('node_modules'))
        .map((name) => join(folder, name))
        .toSorted();
};

const specifiersOf = (root: string, file: string): readonly Specifier[] =>
    ts.preProcessFile(readFileSync(join(root, file), 'utf8'), true, true).importedFiles.map((imported) => ({ file, text: imported.fileName }));

const packageName = (text: string): string => text.split('/').slice(0, text.startsWith('@') ? 2 : 1).join('/');

const isBare = (text: string): boolean => !text.startsWith('.') && !text.startsWith('/') && !text.startsWith('#') && !BUILTIN.test(text);

const everywhere = (root: string, boundaries: Boundaries, specifier: Specifier): readonly string[] => {
    const { file, text } = specifier;
    const problems: string[] = [];
    if (text.startsWith('.') && relative(root, resolve(root, dirname(file), text)).startsWith('..')) {
        problems.push(`${file}: ${text} leaves the package root`);
    }
    const foreign = boundaries.units.find((unit) => text.includes(`${unit}/src/`));
    if (foreign !== undefined) {
        problems.push(`${file}: ${text} reaches into the src/ of ${foreign}`);
    }
    return problems;
};

const shipped = (boundaries: Boundaries, specifier: Specifier): readonly string[] => {
    const { file, text } = specifier;
    if (BUILTIN.test(text)) {
        return boundaries.builtins.includes(text) ? [] : [`${file}: ${text} is not an allowed built-in of ${boundaries.domain}/ (gates/config.json builtins)`];
    }
    if (isBare(text) && !boundaries.dependencies.includes(packageName(text))) {
        return [`${file}: ${text} is not in the dependencies of package.json`];
    }
    return [];
};

const unusedOf = (boundaries: Boundaries, imported: ReadonlySet<string>): readonly string[] => [
    ...boundaries.dependencies
        .filter((name) => !imported.has(name) && !boundaries.declaredAhead.includes(name))
        .map((name) => `package.json: dependency ${name} is never imported by ${boundaries.domain}/ and is not in declaredAhead`),
    ...boundaries.declaredAhead
        .filter((name) => imported.has(name) || !boundaries.dependencies.includes(name))
        .map((name) => `gates/config.json: declaredAhead lists ${name}, which ${imported.has(name) ? `${boundaries.domain}/ imports: remove it` : 'is not a dependency'}`),
];

export const checkBoundaries = (root: string, boundaries: Boundaries): readonly string[] => {
    const all = boundaries.source.flatMap((folder) => filesUnder(root, folder)).flatMap((file) => specifiersOf(root, file));
    const own = all.filter((specifier) => specifier.file.startsWith(`${boundaries.domain}/`));
    const imported = new Set(own.filter((specifier) => isBare(specifier.text)).map((specifier) => packageName(specifier.text)));
    return [
        ...all.flatMap((specifier) => everywhere(root, boundaries, specifier)),
        ...own.flatMap((specifier) => shipped(boundaries, specifier)),
        ...unusedOf(boundaries, imported),
    ];
};

type Fields = Readonly<Record<string, unknown>>;

const isFields = (input: unknown): input is Fields => typeof input === 'object' && input !== null && !Array.isArray(input);

const textsOf = (input: unknown): readonly string[] =>
    Array.isArray(input) ? input.filter((item: unknown): item is string => typeof item === 'string') : [];

const fieldsOf = (path: string): Fields => {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return isFields(parsed) ? parsed : {};
};

const workspaceOf = (root: string): string | null => {
    const parent = dirname(root);
    if (parent === root) {
        return null;
    }
    const manifest = join(parent, 'package.json');
    return existsSync(manifest) && 'workspaces' in fieldsOf(manifest) ? parent : workspaceOf(parent);
};

const unitsBeside = (root: string): readonly string[] => {
    const top = workspaceOf(root);
    if (top === null) {
        return [];
    }
    return ['.', 'packages']
        .flatMap((parent) => (existsSync(join(top, parent)) ? readdirSync(join(top, parent)).map((name) => join(top, parent, name)) : []))
        .filter((folder) => existsSync(join(folder, 'package.json')) && resolve(folder) !== resolve(root) && resolve(folder) !== resolve(top))
        .map((folder) => basename(folder));
};

export const boundariesOf = (root: string): Boundaries => {
    const config = fieldsOf(join(root, 'gates/config.json'));
    const manifest = fieldsOf(join(root, 'package.json'));
    return {
        source: textsOf(config.source),
        domain: typeof config.domain === 'string' ? config.domain : 'src',
        builtins: textsOf(config.builtins),
        declaredAhead: textsOf(config.declaredAhead),
        dependencies: isFields(manifest.dependencies) ? Object.keys(manifest.dependencies) : [],
        units: unitsBeside(root),
    };
};

if (import.meta.main) {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const problems = checkBoundaries(root, boundariesOf(root));
    problems.forEach((problem) => console.error(`  ${problem}`));
    console.log(problems.length === 0 ? 'boundaries: clean' : `boundaries: ${problems.length} finding(s)`);
    process.exitCode = problems.length === 0 ? 0 : 1;
}
