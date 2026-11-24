import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { err, ok, type Result } from './result.ts';
import { countsOf, filesAbove, guardAt, loadBaseline, ratchet, writeBaseline, type Git } from './domain-baseline.ts';
import { applyEntries, loadEntries, releasedMigrations, type Migrations, type Rules } from './domain-exceptions.ts';
import { compareFindings, describeFinding, type Counts, type Finding } from './domain-findings.ts';
import { loadLanes, type Lanes } from './lane-map.ts';

const CONFIG = 'gates/config.json';
const MOVES = 'gates/domain-types-moves.tsv';

export interface Settings extends Rules {
    readonly extraBrandFiles: readonly string[];
    readonly exceptions: string;
    readonly migrations: Migrations | null;
    readonly inheritBaseline: string | null;
}

const DEFAULTS: Settings = {
    brandFile: null,
    extraBrandFiles: [],
    exceptions: 'gates/domain-types-exceptions.json',
    migrations: null,
    inheritBaseline: null,
    contractFolders: ['src/contract/', 'src/compaction-timing/'],
    callbackContainers: false,
};

type Fields = Readonly<Record<string, unknown>>;

const isFields = (input: unknown): input is Fields => typeof input === 'object' && input !== null && !Array.isArray(input);

const textsOf = (input: unknown, fallback: readonly string[]): readonly string[] =>
    Array.isArray(input) && input.every((item): item is string => typeof item === 'string') ? input : fallback;

const migrationsOf = (input: unknown): Migrations | null =>
    isFields(input) && typeof input.dir === 'string' && typeof input.tags === 'string' ? { dir: input.dir, tags: input.tags } : null;

export const parseSettings = (input: unknown): Result<Settings, string> => {
    if (!isFields(input)) {
        return err(`${CONFIG} holds one JSON object`);
    }
    return ok({
        brandFile: typeof input.brandFile === 'string' ? input.brandFile : null,
        extraBrandFiles: textsOf(input.extraBrandFiles, DEFAULTS.extraBrandFiles),
        exceptions: typeof input.exceptions === 'string' ? input.exceptions : DEFAULTS.exceptions,
        migrations: migrationsOf(input.migrations),
        inheritBaseline: typeof input.inheritBaseline === 'string' ? input.inheritBaseline : null,
        contractFolders: textsOf(input.contractFolders, DEFAULTS.contractFolders),
        callbackContainers: input.callbackContainers === true,
    });
};

export const settingsOf = (root: string): Result<Settings, string> => {
    const path = join(root, CONFIG);
    if (!existsSync(path)) {
        return ok(DEFAULTS);
    }
    try {
        return parseSettings(JSON.parse(readFileSync(path, 'utf8')));
    } catch (error) {
        return err(`${path}: ${String(error)}`);
    }
};

export interface Report {
    readonly findings: readonly Finding[];
    readonly stale: readonly string[];
    readonly counts: Counts;
}

export const settle = (root: string, settings: Settings, found: readonly Finding[]): Result<Report, string> => {
    const released = releasedMigrations(root, settings.migrations);
    if (released.kind === 'err') {
        return err(released.error);
    }
    const entries = loadEntries(join(root, settings.exceptions));
    if (entries.kind === 'err') {
        return err(entries.error);
    }
    const outcome = applyEntries(found, entries.value, released.value, settings);
    return ok({ findings: outcome.findings.toSorted(compareFindings), stale: outcome.stale, counts: countsOf(outcome.findings) });
};

export const optionOf = (args: readonly string[], name: string): Result<string | null, string> => {
    const index = args.indexOf(name);
    if (index === -1) {
        return ok(null);
    }
    const value = args[index + 1];
    return value === undefined || value.startsWith('--') ? err(`${name} needs a value`) : ok(resolve(value));
};

export const projectOf = (args: readonly string[], fallback: string): Result<string, string> => {
    const option = optionOf(args, '--project');
    return option.kind === 'err' ? option : ok(option.value ?? fallback);
};

interface RatchetOutcome {
    readonly problems: readonly string[];
    readonly above: ReadonlySet<string>;
}

const printReport = (report: Report, json: boolean, outcome: RatchetOutcome | null): number => {
    const { findings, stale, counts } = report;
    const problems = outcome === null ? null : outcome.problems;
    const failing = outcome === null ? findings : findings.filter((finding) => outcome.above.has(finding.file));
    const lines = [...(problems ?? []), ...stale];
    const total = problems === null ? findings.length + stale.length : lines.length;
    if (json) {
        console.log(JSON.stringify({ findings, stale, counts, problems }, null, 2));
    } else {
        failing.forEach((finding) => console.error(describeFinding(finding)));
        lines.forEach((line) => console.error(line));
        console.log(total === 0 ? 'domain types: clean' : `domain types: ${total} finding(s)`);
    }
    return total === 0 ? 0 : 1;
};

type Mode =
    | { readonly kind: 'plain' }
    | { readonly kind: 'ratchet'; readonly outcome: RatchetOutcome }
    | { readonly kind: 'written'; readonly message: string };

type Option = Result<string | null, string>;

const valueOf = (option: Option): string | null => (option.kind === 'ok' ? option.value : null);

const lanesOf = (option: Option): Result<Lanes | null, string> => {
    const path = valueOf(option);
    return path === null ? ok(null) : loadLanes(path);
};

const modeOf = (args: readonly string[], report: Report): Result<Mode, string> => {
    const reading = optionOf(args, '--baseline');
    const writing = optionOf(args, '--write-baseline');
    const lanePath = optionOf(args, '--lanes');
    const failure = [reading, writing, lanePath].find((option) => option.kind === 'err');
    if (failure?.kind === 'err') {
        return failure;
    }
    const target = valueOf(writing);
    const path = target ?? valueOf(reading);
    const lanes = lanesOf(lanePath);
    if (path === null || lanes.kind === 'err') {
        return lanes.kind === 'err' ? lanes : ok({ kind: 'plain' });
    }
    if (target !== null) {
        const written = writeBaseline(path, report.counts, lanes.value);
        return written.kind === 'err' ? written : ok({ kind: 'written', message: written.value });
    }
    const baseline = loadBaseline(path, lanes.value);
    return baseline.kind === 'err' ? baseline : ok({ kind: 'ratchet', outcome: { problems: ratchet(report.counts, baseline.value), above: filesAbove(report.counts, baseline.value) } });
};

const notCovered = (message: string): number => {
    console.error(`domain types: 3 — NOT COVERED: ${message}`);
    return 3;
};

export const runReport = (args: readonly string[], found: Result<Report, string>): number => {
    if (found.kind === 'err') {
        return notCovered(found.error);
    }
    const mode = modeOf(args, found.value);
    if (mode.kind === 'err') {
        return notCovered(mode.error);
    }
    if (mode.value.kind === 'written') {
        console.log(`domain types: wrote ${mode.value.message}`);
        return 0;
    }
    return printReport(found.value, args.includes('--json'), mode.value.kind === 'ratchet' ? mode.value.outcome : null);
};

const inheritOf = (root: string): Result<string | null, string> => {
    const settings = settingsOf(root);
    if (settings.kind === 'err') {
        return settings;
    }
    const inherit = settings.value.inheritBaseline === null ? null : resolve(root, settings.value.inheritBaseline);
    return ok(inherit !== null && existsSync(inherit) ? inherit : null);
};

const guardArgs = (args: readonly string[]): Result<{ readonly path: string; readonly base: string }, string> => {
    const path = optionOf(args, '--baseline');
    const base = args[args.indexOf('--guard') + 1];
    return path.kind === 'err' || path.value === null || base === undefined || base.startsWith('--')
        ? err('usage: --baseline <file or folder> --guard <merge base>')
        : ok({ path: path.value, base });
};

export const runGuard = (root: string, args: readonly string[], run?: Git): number => {
    const parsed = guardArgs(args);
    if (parsed.kind === 'err') {
        return notCovered(parsed.error);
    }
    const inherit = inheritOf(root);
    if (inherit.kind === 'err') {
        return notCovered(inherit.error);
    }
    const { path, base } = parsed.value;
    try {
        const problems = guardAt(path, base, join(root, MOVES), inherit.value, run);
        if (problems.kind === 'err') {
            return notCovered(problems.error);
        }
        if (problems.value === null) {
            console.log(`domain baseline: ${path} is not at the merge base: this change introduces it`);
            return 0;
        }
        problems.value.forEach((line) => console.error(`  ${line}`));
        console.log(problems.value.length === 0 ? 'domain baseline: no entry rose and none is new' : `domain baseline: 1 — ${problems.value.length} entry(ies) rose or are new: fix the code instead`);
        return problems.value.length === 0 ? 0 : 1;
    } catch (error) {
        return notCovered(String(error));
    }
};
