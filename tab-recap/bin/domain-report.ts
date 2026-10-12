import { join, resolve } from 'node:path';
import { err, ok, type Result } from '#src/protocol/result.ts';
import { countsOf } from './domain-baseline.ts';
import { applyEntries, loadEntries, releasedMigrations } from './domain-exceptions.ts';
import { compareFindings, describeFinding, type Counts, type Finding } from './domain-findings.ts';

const EXCEPTIONS_DIR = 'ci/domain-types-exceptions';

export interface Report {
    readonly findings: readonly Finding[];
    readonly stale: readonly string[];
    readonly counts: Counts;
}

export const settle = (root: string, found: readonly Finding[]): Result<Report, string> => {
    const released = releasedMigrations(root);
    if (released.kind === 'err') {
        return err(released.error);
    }
    const entries = loadEntries(join(root, EXCEPTIONS_DIR));
    if (entries.kind === 'err') {
        return err(entries.error);
    }
    const outcome = applyEntries(found, entries.value, released.value);
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

export interface RatchetOutcome {
    readonly problems: readonly string[];
    readonly above: ReadonlySet<string>;
}

export const printReport = (report: Report, json: boolean, outcome: RatchetOutcome | null): number => {
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
