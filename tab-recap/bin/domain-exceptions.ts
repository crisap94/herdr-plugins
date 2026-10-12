import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { err, ok, type Result } from '#src/protocol/result.ts';
import type { Finding } from './domain-findings.ts';

export const BRAND_FILE = 'src/recap/domain/brand.ts';
const SCHEMA_DIR = 'src/adapters/db/schema';
const RELEASE_TAGS = 'tab-recap-v*';

export type Entry =
    | { readonly class: 'callback' | 'brand'; readonly file: string; readonly function: string; readonly parameter: string | null; readonly reason: string }
    | { readonly class: 'migration'; readonly file: string; readonly reason: string };

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

export const parseEntry = (input: unknown): Result<Entry, string> => {
    if (!isFields(input)) {
        return err('an exception is a JSON object');
    }
    const file = textField(input, 'file');
    const reason = textField(input, 'reason');
    if (file.kind === 'err' || reason.kind === 'err') {
        return err('"file" and "reason" are required');
    }
    const kind = input.class;
    if (kind === 'migration') {
        return ok({ class: 'migration', file: file.value, reason: reason.value });
    }
    if (kind !== 'callback' && kind !== 'brand') {
        return err('"class" is callback, brand or migration');
    }
    const owner = textField(input, 'function');
    const parameter = input.parameter;
    if (owner.kind === 'err' || (parameter !== null && typeof parameter !== 'string')) {
        return err('"function" is required; "parameter" is a name, or null for a return');
    }
    return ok({ class: kind, file: file.value, function: owner.value, parameter, reason: reason.value });
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

export const releasedMigrations = (root: string): Result<readonly string[], string> => {
    try {
        const tag = git(root, ['tag', '--list', RELEASE_TAGS, '--sort=-v:refname'])
            .split('\n')
            .find((line) => line.length > 0);
        if (tag === undefined) {
            return ok([]);
        }
        const files = git(root, ['ls-tree', '-r', '--name-only', tag, '--', SCHEMA_DIR]).split('\n');
        return ok(files.filter((file) => file.length > 0 && !file.endsWith('/index.ts')));
    } catch (error) {
        return err(String(error));
    }
};

const entryLabel = (entry: Entry): string =>
    entry.class === 'migration' ? entry.file : `${entry.file} ${entry.function} ${entry.parameter ?? 'return'}`;

const matches = (entry: Entry, released: readonly string[], finding: Finding): boolean => {
    if (entry.file !== finding.file) {
        return false;
    }
    if (entry.class === 'migration') {
        return released.includes(entry.file);
    }
    if (entry.class === 'brand' && entry.file !== BRAND_FILE) {
        return false;
    }
    const castInBrand = entry.class === 'brand' && finding.category === 'assertion';
    return (finding.category === 'parameter' || finding.category === 'return' || castInBrand) &&
        entry.function === finding.owner &&
        entry.parameter === finding.parameter;
};

const problemOf = (entry: Entry, released: readonly string[], hits: number): string | undefined => {
    if (entry.class === 'migration' && !released.includes(entry.file)) {
        return 'names no released migration';
    }
    if (entry.class === 'brand' && entry.file !== BRAND_FILE) {
        return `is not in ${BRAND_FILE}`;
    }
    return hits === 0 ? 'matches no finding' : undefined;
};

export const applyEntries = (findings: readonly Finding[], entries: readonly Entry[], released: readonly string[]): Outcome => {
    const hits = entries.map((entry) => findings.filter((finding) => matches(entry, released, finding)));
    const stale = entries.flatMap((entry, index) => {
        const problem = problemOf(entry, released, hits[index]?.length ?? 0);
        return problem === undefined ? [] : [`not supported: exception ${entryLabel(entry)} ${problem}`];
    });
    const excepted = new Set(hits.flat());
    return { findings: findings.filter((finding) => !excepted.has(finding)), stale };
};
