import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { err, ok, type Result } from './result.ts';
import type { Category, Finding } from './domain-findings.ts';

const CONTRACT_CATEGORIES: ReadonlySet<Category> = new Set<Category>(['property', 'container', 'parameter', 'return']);

export interface Rules {
    readonly brandFile: string | null;
    readonly contractFolders: readonly string[];
    readonly callbackContainers: boolean;
}

export interface Migrations {
    readonly dir: string;
    readonly tags: string;
}

export type Entry =
    | { readonly class: 'callback' | 'brand'; readonly file: string; readonly function: string; readonly parameter: string | null; readonly reason: string }
    | { readonly class: 'migration'; readonly file: string; readonly reason: string }
    | { readonly class: 'contract'; readonly file: string; readonly symbol: string; readonly field: string; readonly reason: string };

export interface Outcome {
    readonly findings: readonly Finding[];
    readonly stale: readonly string[];
}

type Fields = Readonly<Record<string, unknown>>;

const isFields = (input: unknown): input is Fields => typeof input === 'object' && input !== null && !Array.isArray(input);

const textField = (fields: Fields, key: string): Result<string, string> => {
    const value = fields[key];
    return typeof value === 'string' && value.length > 0 ? ok(value) : err(`"${key}" must be a non-empty string`);
};

const contractEntry = (fields: Fields, file: string, reason: string): Result<Entry, string> => {
    const symbol = textField(fields, 'symbol');
    const field = textField(fields, 'field');
    if (symbol.kind === 'err' || field.kind === 'err') {
        return err('"symbol" and "field" are required for a contract exception');
    }
    return ok({ class: 'contract', file, symbol: symbol.value, field: field.value, reason });
};

const functionEntry = (fields: Fields, kind: unknown, file: string, reason: string): Result<Entry, string> => {
    if (kind !== 'callback' && kind !== 'brand') {
        return err('"class" is callback, brand, migration or contract');
    }
    const owner = textField(fields, 'function');
    const parameter = fields.parameter;
    if (owner.kind === 'err' || (parameter !== null && typeof parameter !== 'string')) {
        return err('"function" is required; "parameter" is a name, or null for a return');
    }
    return ok({ class: kind, file, function: owner.value, parameter, reason });
};

export const parseEntry = (input: unknown): Result<Entry, string> => {
    if (!isFields(input)) {
        return err('an exception is a JSON object');
    }
    const file = textField(input, 'file');
    const reason = textField(input, 'reason');
    if (file.kind === 'err' || reason.kind === 'err') {
        return err('"file" and "reason" are required');
    }
    if (input.class === 'migration') {
        return ok({ class: 'migration', file: file.value, reason: reason.value });
    }
    if (input.class === 'contract') {
        return contractEntry(input, file.value, reason.value);
    }
    return functionEntry(input, input.class, file.value, reason.value);
};

export const parseEntries = (input: unknown): Result<readonly Entry[], string> => {
    if (!Array.isArray(input)) {
        return err('an exception file holds a JSON array');
    }
    const parsed = input.map((item: unknown) => parseEntry(item));
    const failure = parsed.find((result) => result.kind === 'err');
    if (failure?.kind === 'err') {
        return err(failure.error);
    }
    return ok(parsed.flatMap((result) => (result.kind === 'ok' ? [result.value] : [])));
};

const entriesOf = (path: string): Result<readonly Entry[], string> => {
    try {
        const parsed = parseEntries(JSON.parse(readFileSync(path, 'utf8')));
        return parsed.kind === 'err' ? err(`${path}: ${parsed.error}`) : parsed;
    } catch (error) {
        return err(`${path}: ${String(error)}`);
    }
};

export const loadEntries = (dir: string): Result<readonly Entry[], string> => {
    if (!existsSync(dir)) {
        return ok([]);
    }
    if (!statSync(dir).isDirectory()) {
        return entriesOf(dir);
    }
    const files = readdirSync(dir)
        .filter((name) => name.endsWith('.json'))
        .toSorted()
        .map((name) => entriesOf(join(dir, name)));
    const failure = files.find((result) => result.kind === 'err');
    if (failure?.kind === 'err') {
        return err(failure.error);
    }
    return ok(files.flatMap((result) => (result.kind === 'ok' ? result.value : [])));
};

const git = (cwd: string, args: readonly string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8' });

export const releasedMigrations = (root: string, migrations: Migrations | null): Result<readonly string[], string> => {
    if (migrations === null) {
        return ok([]);
    }
    try {
        const tag = git(root, ['tag', '--list', migrations.tags, '--sort=-v:refname'])
            .split('\n')
            .find((line) => line.length > 0);
        if (tag === undefined) {
            return ok([]);
        }
        const files = git(root, ['ls-tree', '-r', '--name-only', tag, '--', migrations.dir]).split('\n');
        return ok(files.filter((file) => file.length > 0 && !file.endsWith('/index.ts')));
    } catch (error) {
        return err(String(error));
    }
};

const entryLabel = (entry: Entry): string => {
    if (entry.class === 'contract') {
        return `${entry.file} ${entry.symbol} ${entry.field}`;
    }
    return entry.class === 'migration' ? entry.file : `${entry.file} ${entry.function} ${entry.parameter ?? 'return'}`;
};

const inContract = (rules: Rules, file: string): boolean => rules.contractFolders.some((folder) => file.startsWith(folder));

const fieldOf = (finding: Finding): string => finding.parameter ?? finding.site.replace(/^property /, '');

const matchesContract = (entry: Extract<Entry, { readonly class: 'contract' }>, rules: Rules, finding: Finding): boolean =>
    inContract(rules, entry.file) &&
    CONTRACT_CATEGORIES.has(finding.category) &&
    entry.symbol === finding.owner &&
    entry.field === fieldOf(finding);

const coversCategory = (entry: Extract<Entry, { readonly class: 'callback' | 'brand' }>, rules: Rules, finding: Finding): boolean => {
    if (finding.category === 'parameter' || finding.category === 'return') {
        return true;
    }
    return entry.class === 'brand' ? finding.category === 'assertion' : rules.callbackContainers && finding.category === 'container';
};

const matchesFunction = (entry: Extract<Entry, { readonly class: 'callback' | 'brand' }>, rules: Rules, finding: Finding): boolean =>
    (entry.class !== 'brand' || entry.file === rules.brandFile) &&
    coversCategory(entry, rules, finding) &&
    entry.function === finding.owner &&
    entry.parameter === finding.parameter;

const matches = (entry: Entry, released: readonly string[], rules: Rules, finding: Finding): boolean => {
    if (entry.file !== finding.file) {
        return false;
    }
    if (entry.class === 'migration') {
        return released.includes(entry.file);
    }
    return entry.class === 'contract' ? matchesContract(entry, rules, finding) : matchesFunction(entry, rules, finding);
};

const problemOf = (entry: Entry, released: readonly string[], rules: Rules, hits: number): string | undefined => {
    if (entry.class === 'migration' && !released.includes(entry.file)) {
        return 'names no released migration';
    }
    if (entry.class === 'brand' && entry.file !== rules.brandFile) {
        return `is not in ${rules.brandFile ?? 'the brand file: gates/config.json names none'}`;
    }
    if (entry.class === 'contract' && !inContract(rules, entry.file)) {
        return `is not under ${rules.contractFolders.join(' or ')}`;
    }
    return hits === 0 ? 'matches no finding' : undefined;
};

export const applyEntries = (findings: readonly Finding[], entries: readonly Entry[], released: readonly string[], rules: Rules): Outcome => {
    const hits = entries.map((entry) => findings.filter((finding) => matches(entry, released, rules, finding)));
    const stale = entries.flatMap((entry, index) => {
        const problem = problemOf(entry, released, rules, hits[index]?.length ?? 0);
        return problem === undefined ? [] : [`not supported: exception ${entryLabel(entry)} ${problem}`];
    });
    const excepted = new Set(hits.flat());
    return { findings: findings.filter((finding) => !excepted.has(finding)), stale };
};
