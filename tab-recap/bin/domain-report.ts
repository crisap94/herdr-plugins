import { join, resolve } from 'node:path';
import { err, ok, type Result } from '#src/protocol/result.ts';
import { applyEntries, loadEntries, releasedMigrations } from './domain-exceptions.ts';
import { compareFindings, describeFinding, type Category, type Finding } from './domain-findings.ts';

const EXCEPTIONS_DIR = 'ci/domain-types-exceptions';

export type Counts = Readonly<Record<string, Readonly<Partial<Record<Category, number>>>>>;

export interface Report {
    readonly findings: readonly Finding[];
    readonly stale: readonly string[];
    readonly counts: Counts;
}

const countsOf = (findings: readonly Finding[]): Counts => {
    const counts: Record<string, Partial<Record<Category, number>>> = {};
    findings.forEach((finding) => {
        const row = counts[finding.file] ?? {};
        counts[finding.file] = { ...row, [finding.category]: (row[finding.category] ?? 0) + 1 };
    });
    return counts;
};

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

export const projectOf = (args: readonly string[], fallback: string): Result<string, string> => {
    const index = args.indexOf('--project');
    if (index === -1) {
        return ok(fallback);
    }
    const value = args[index + 1];
    return value === undefined ? err('--project needs a tsconfig path') : ok(resolve(value));
};

export const printReport = (report: Report, json: boolean): number => {
    const { findings, stale, counts } = report;
    if (json) {
        console.log(JSON.stringify({ findings, stale, counts }, null, 2));
    } else {
        findings.forEach((finding) => console.error(describeFinding(finding)));
        stale.forEach((line) => console.error(line));
        console.log(findings.length + stale.length === 0 ? 'domain types: clean' : `domain types: ${findings.length + stale.length} finding(s)`);
    }
    return findings.length + stale.length === 0 ? 0 : 1;
};
