import { join } from 'node:path';
import { ok, type Result } from '#src/protocol/result.ts';
import { loadBaseline, ratchet, writeBaseline } from './domain-baseline.ts';
import { optionOf, printReport, type Report } from './domain-report.ts';
import { loadLanes } from './lane-map.ts';

export type Mode =
    | { readonly kind: 'plain' }
    | { readonly kind: 'ratchet'; readonly problems: readonly string[] }
    | { readonly kind: 'written'; readonly message: string };

type Option = Result<string | null, string>;

const valueOf = (option: Option): string | null => (option.kind === 'ok' ? option.value : null);

const modeOf = (root: string, args: readonly string[], report: Report): Result<Mode, string> => {
    const reading = optionOf(args, '--baseline');
    const writing = optionOf(args, '--write-baseline');
    const lanePath = optionOf(args, '--lanes');
    const failure = [reading, writing, lanePath].find((option) => option.kind === 'err');
    if (failure?.kind === 'err') {
        return failure;
    }
    const target = valueOf(writing);
    const dir = target ?? valueOf(reading);
    if (dir === null) {
        return ok({ kind: 'plain' });
    }
    const lanes = loadLanes(valueOf(lanePath) ?? join(root, 'ci/lanes.json'));
    if (lanes.kind === 'err') {
        return lanes;
    }
    if (target !== null) {
        const written = writeBaseline(dir, report.counts, lanes.value);
        return written.kind === 'err' ? written : ok({ kind: 'written', message: written.value });
    }
    const baseline = loadBaseline(dir, lanes.value);
    return baseline.kind === 'err' ? baseline : ok({ kind: 'ratchet', problems: ratchet(report.counts, baseline.value) });
};

const notCovered = (message: string): number => {
    console.error(`domain types: 3 — NOT COVERED: ${message}`);
    return 3;
};

export const runReport = (root: string, args: readonly string[], found: Result<Report, string>): number => {
    if (found.kind === 'err') {
        return notCovered(found.error);
    }
    const mode = modeOf(root, args, found.value);
    if (mode.kind === 'err') {
        return notCovered(mode.error);
    }
    if (mode.value.kind === 'written') {
        console.log(`domain types: wrote ${mode.value.message}`);
        return 0;
    }
    return printReport(found.value, args.includes('--json'), mode.value.kind === 'ratchet' ? mode.value.problems : null);
};
