import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { err, ok, type Result } from '#src/protocol/result.ts';
import { CATEGORIES, type Counts, type Finding } from './domain-findings.ts';
import type { Lanes } from './lane-map.ts';

const LANE_FILE = /^(.+)\.json$/;

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

export const loadBaseline = (dir: string, lanes: Lanes): Result<Counts, string> => {
    const names = readdirSync(dir).filter((name) => LANE_FILE.test(name)).toSorted();
    const merged: Record<string, Counts[string]> = {};
    for (const name of names) {
        const lane = LANE_FILE.exec(name)?.[1] ?? '';
        let parsed: Result<Counts, string>;
        try {
            parsed = parseBaseline(JSON.parse(readFileSync(join(dir, name), 'utf8')));
        } catch (error) {
            return err(`${name}: ${String(error)}`);
        }
        if (parsed.kind === 'err') {
            return err(`${name}: ${parsed.error}`);
        }
        const owned = new Set(lanes[lane] ?? []);
        const stray = Object.keys(parsed.value).find((file) => !owned.has(file));
        if (stray !== undefined) {
            return err(`${name}: ${stray} is not a file of lane ${lane}`);
        }
        Object.assign(merged, parsed.value);
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

export const countsOf = (findings: readonly Finding[]): Counts => {
    const counts: Record<string, Partial<Record<Finding['category'], number>>> = {};
    findings.forEach((finding) => {
        const row = counts[finding.file] ?? {};
        counts[finding.file] = { ...row, [finding.category]: (row[finding.category] ?? 0) + 1 };
    });
    return counts;
};

const sortedRow = (row: Counts[string]): Counts[string] => Object.fromEntries(CATEGORIES.flatMap((category) => (row[category] === undefined ? [] : [[category, row[category]]])));

export const writeBaseline = (dir: string, counts: Counts, lanes: Lanes): Result<string, string> => {
    const owner = new Map(Object.entries(lanes).flatMap(([name, files]) => files.map((file): [string, string] => [file, name])));
    const stray = Object.keys(counts).find((file) => !owner.has(file));
    if (stray !== undefined) {
        return err(`${stray} belongs to no lane: regenerate ci/lanes.json`);
    }
    mkdirSync(dir, { recursive: true });
    for (const lane of Object.keys(lanes)) {
        const mine = Object.keys(counts).filter((file) => owner.get(file) === lane).toSorted();
        writeFileSync(join(dir, `${lane}.json`), `${JSON.stringify(Object.fromEntries(mine.map((file) => [file, sortedRow(counts[file] ?? {})])), null, 2)}\n`);
    }
    return ok(`${Object.keys(lanes).length} baseline files in ${dir}`);
};

export const guard = (base: Counts, head: Counts): readonly string[] =>
    Object.keys(head).toSorted().flatMap((file) =>
        CATEGORIES.flatMap((category) => {
            const was = base[file]?.[category];
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
