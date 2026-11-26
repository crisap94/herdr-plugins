import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { err, ok, type Result } from './result.ts';
import { CATEGORIES, type Counts, type Finding } from './domain-findings.ts';

const BASELINE_FILE = /^(.+)\.json$/;

type Fields = Readonly<Record<string, unknown>>;

const isFields = (input: unknown): input is Fields => typeof input === 'object' && input !== null && !Array.isArray(input);

const parseRow = (file: string, input: unknown): Result<Counts[string], string> => {
    if (!isFields(input)) {
        return err(`${file}: an entry holds one count per category`);
    }
    const stray = Object.keys(input).find((key) => !CATEGORIES.some((category) => category === key));
    if (stray !== undefined) {
        return err(`${file}: "${stray}" is not a category`);
    }
    const bad = Object.entries(input).find(([, count]) => typeof count !== 'number' || !Number.isSafeInteger(count) || count <= 0);
    if (bad !== undefined) {
        return err(`${file}: ${bad[0]} must be a positive whole number (delete the category at zero)`);
    }
    return ok(input);
};

export const parseBaseline = (input: unknown): Result<Counts, string> => {
    if (!isFields(input)) {
        return err('a baseline file holds an object keyed by file');
    }
    const rows = Object.entries(input).map(([file, row]) => [file, parseRow(file, row)] as const);
    const failure = rows.find(([, row]) => row.kind === 'err');
    if (failure?.[1].kind === 'err') {
        return err(failure[1].error);
    }
    const empty = rows.find(([, row]) => row.kind === 'ok' && Object.keys(row.value).length === 0);
    if (empty !== undefined) {
        return err(`${empty[0]}: an entry with no category is deleted`);
    }
    return ok(Object.fromEntries(rows.flatMap(([file, row]) => (row.kind === 'ok' ? [[file, row.value]] : []))));
};

const baselineFile = (path: string): Result<Counts, string> => {
    try {
        const parsed = parseBaseline(JSON.parse(readFileSync(path, 'utf8')));
        return parsed.kind === 'err' ? err(`${path}: ${parsed.error}`) : parsed;
    } catch (error) {
        return err(`${path}: ${String(error)}`);
    }
};

const strayOf = (name: string, rows: Counts, merged: Counts): string | undefined => {
    const stray = Object.keys(rows).find((file) => file in merged);
    return stray === undefined ? undefined : `${name}: ${stray} has a row in two baseline files`;
};

export const loadBaseline = (path: string): Result<Counts, string> => {
    if (!existsSync(path)) {
        return ok({});
    }
    if (!statSync(path).isDirectory()) {
        return baselineFile(path);
    }
    const merged: Record<string, Counts[string]> = {};
    for (const name of readdirSync(path).filter((entry) => BASELINE_FILE.test(entry)).toSorted()) {
        const rows = baselineFile(join(path, name));
        if (rows.kind === 'err') {
            return rows;
        }
        const stray = strayOf(name, rows.value, merged);
        if (stray !== undefined) {
            return err(stray);
        }
        Object.assign(merged, rows.value);
    }
    return ok(merged);
};

export const ratchet = (found: Counts, baseline: Counts): readonly string[] =>
    [...new Set([...Object.keys(found), ...Object.keys(baseline)])].toSorted().flatMap((file) =>
        CATEGORIES.flatMap((category) => {
            const now = found[file]?.[category] ?? 0;
            const allowed = baseline[file]?.[category] ?? 0;
            if (now > allowed) {
                return [`above baseline: ${file}: ${category} ${now}, baseline ${allowed}`];
            }
            return now < allowed ? [`stale baseline: ${file}: ${category} ${now}, baseline ${allowed}: lower the entry, and delete it at zero`] : [];
        }),
    );

export const filesAbove = (found: Counts, baseline: Counts): ReadonlySet<string> =>
    new Set(Object.keys(found).filter((file) => CATEGORIES.some((category) => (found[file]?.[category] ?? 0) > (baseline[file]?.[category] ?? 0))));

export const VACATED = '';

export const chainRenames = (statusLines: readonly string[], moves: ReadonlyMap<string, string> = new Map(), atBase: ReadonlySet<string> = new Set()): ReadonlyMap<string, string> => {
    const origin = new Map<string, string>();
    statusLines.forEach((line) => {
        const [status, from, to] = line.split('\t');
        if (status?.startsWith('R') === true && from !== undefined && to !== undefined) {
            origin.set(to, origin.get(from) ?? from);
            origin.set(from, VACATED);
        } else if (status === 'D' && from !== undefined) {
            origin.set(from, VACATED);
        }
    });
    moves.forEach((from, to) => {
        if ((origin.get(to) ?? VACATED) === VACATED && !atBase.has(to)) {
            origin.set(to, from);
        }
    });
    return origin;
};

export const parseMoves = (text: string): ReadonlyMap<string, string> =>
    new Map(
        text
            .split(/\r?\n/)
            .map((line) => line.split('\t').map((cell) => cell.trim()))
            .flatMap(([to, from]): [string, string][] => (to !== undefined && to !== '' && from !== undefined && from !== '' ? [[to, from]] : [])),
    );

export const countsOf = (findings: readonly Finding[]): Counts => {
    const counts: Record<string, Partial<Record<Finding['category'], number>>> = {};
    findings.forEach((finding) => {
        const row = counts[finding.file] ?? {};
        counts[finding.file] = { ...row, [finding.category]: (row[finding.category] ?? 0) + 1 };
    });
    return counts;
};

const sortedRow = (row: Counts[string]): Counts[string] => Object.fromEntries(CATEGORIES.flatMap((category) => (row[category] === undefined ? [] : [[category, row[category]]])));

const rowsOf = (counts: Counts, files: readonly string[]): string =>
    `${JSON.stringify(Object.fromEntries(files.toSorted().map((file) => [file, sortedRow(counts[file] ?? {})])), null, 2)}\n`;

export const writeBaseline = (dir: string, counts: Counts): Result<string, string> => {
    if (existsSync(dir) && statSync(dir).isDirectory()) {
        return err(`${dir} is a folder: write one file with --write-baseline <file>, then split its rows by source folder`);
    }
    mkdirSync(dirname(dir), { recursive: true });
    writeFileSync(dir, rowsOf(counts, Object.keys(counts)));
    return ok(`${Object.keys(counts).length} rows in ${dir}`);
};

export const guard = (base: Counts, head: Counts, renamed: ReadonlyMap<string, string> = new Map()): readonly string[] =>
    Object.keys(head).toSorted().flatMap((file) =>
        CATEGORIES.flatMap((category) => {
            const origin = renamed.get(file) ?? file;
            const was = origin === VACATED ? undefined : base[origin]?.[category];
            const now = head[file]?.[category];
            if (now === undefined) {
                return [];
            }
            if (was === undefined) {
                return [`new entry: ${file}: ${category} ${now}`];
            }
            return now > was ? [`raised: ${file}: ${category} ${was} -> ${now}`] : [];
        }),
    );

const LEGACY_LINE = /^(?:new entry|raised): (.+?): legacy /u;

const legacyFileOf = (line: string): string | undefined => {
    const file = LEGACY_LINE.exec(line)?.[1];
    return file !== undefined && /(^|\/)legacy\.ts$/u.test(file) ? file : undefined;
};

const totalOf = (counts: Counts): number =>
    Object.values(counts).reduce((sum, row) => sum + Object.values(row).reduce((rowSum, count) => rowSum + count, 0), 0);

const mergeFiles = (files: ReadonlyMap<string, Counts>): Counts => Object.fromEntries([...files.values()].flatMap((counts) => Object.entries(counts)));

export const guardFiles = (base: ReadonlyMap<string, Counts>, head: ReadonlyMap<string, Counts>, renamed: ReadonlyMap<string, string> = new Map()): readonly string[] => {
    const lines = guard(mergeFiles(base), mergeFiles(head), renamed);
    const kept = lines.filter((line) => legacyFileOf(line) === undefined);
    const dropped = lines.flatMap((line) => {
        const file = legacyFileOf(line);
        return file === undefined ? [] : [file];
    });
    const totals = [...head.keys()].toSorted().flatMap((name) => {
        const counts = head.get(name) ?? {};
        const before = totalOf(base.get(name) ?? {});
        const after = totalOf(counts);
        return dropped.some((file) => counts[file] !== undefined) && after > before ? [`baseline total rose: ${name}: ${before} -> ${after}`] : [];
    });
    return [...kept, ...totals];
};

export type Git = (args: readonly string[]) => string;

const git: Git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

type Texts = ReadonlyMap<string, string>;

const countsOfTexts = (texts: Texts): Result<ReadonlyMap<string, Counts>, string> => {
    const files = new Map<string, Counts>();
    for (const [name, text] of texts) {
        const parsed = parseBaseline(JSON.parse(text));
        if (parsed.kind === 'err') {
            return parsed;
        }
        files.set(name, parsed.value);
    }
    return ok(files);
};

const jsonFiles = (lines: string): readonly string[] => lines.split('\n').filter((line) => line.endsWith('.json'));

const textsNow = (path: string): Texts =>
    new Map(
        statSync(path).isDirectory()
            ? jsonFiles(readdirSync(path).join('\n')).map((name): [string, string] => [name, readFileSync(join(path, name), 'utf8')])
            : [[basename(path), readFileSync(path, 'utf8')]],
    );

const renamesOf = (run: Git, base: string, moves: string): ReadonlyMap<string, string> => {
    const committed = run(['log', '--reverse', '-M', '--name-status', '--format=', '--relative', `${base}..HEAD`, '--', '.']).split('\n');
    const pending = run(['diff', '-M', '--name-status', '--relative', 'HEAD']).split('\n');
    const atBase = new Set(run(['ls-tree', '-r', '--name-only', base, '--', '.']).split('\n'));
    return chainRenames([...committed, ...pending], existsSync(moves) ? parseMoves(readFileSync(moves, 'utf8')) : new Map(), atBase);
};

const filesAt = (run: Git, base: string, local: string): readonly string[] => jsonFiles(run(['ls-tree', '-r', '--name-only', base, '--', local]));

const textsAt = (run: Git, base: string, files: readonly string[]): Texts => new Map(files.map((file): [string, string] => [basename(file), run(['show', `${base}:./${file}`])]));

const inheritedAt = (run: Git, base: string, inherit: string | null): Result<ReadonlyMap<string, Counts>, string> =>
    inherit === null ? ok(new Map()) : countsOfTexts(textsAt(run, base, filesAt(run, base, relative(process.cwd(), inherit))));

export const guardAt = (path: string, base: string, moves: string, inherit: string | null = null, run: Git = git): Result<readonly string[] | null, string> => {
    const local = relative(process.cwd(), path);
    const listed = filesAt(run, base, local);
    const files = listed.length > 0 || local.endsWith('.json') ? listed : filesAt(run, base, `${local}.json`);
    const before = textsAt(run, base, files);
    if (before.size === 0) {
        return ok(null);
    }
    const own = countsOfTexts(before);
    const inherited = inheritedAt(run, base, inherit);
    const now = existsSync(path) ? countsOfTexts(textsNow(path)) : ok(new Map<string, Counts>());
    if (own.kind === 'err') {
        return own;
    }
    if (inherited.kind === 'err') {
        return inherited;
    }
    const inheritedRows: ReadonlyMap<string, Counts> = new Map([['', mergeFiles(inherited.value)]]);
    return now.kind === 'err' ? now : ok(guardFiles(new Map([...inheritedRows, ...own.value]), now.value, renamesOf(run, base, moves)));
};
