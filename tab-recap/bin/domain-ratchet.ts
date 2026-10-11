import { join } from 'node:path';
import { err, ok, type Result } from '#src/protocol/result.ts';
import { loadBaseline, ratchet, writeBaseline } from './domain-baseline.ts';
import { optionOf, type Report } from './domain-report.ts';
import { loadLanes } from './lane-map.ts';

export type Mode =
    | { readonly kind: 'plain' }
    | { readonly kind: 'ratchet'; readonly problems: readonly string[] }
    | { readonly kind: 'written'; readonly message: string };

export const modeOf = (root: string, args: readonly string[], report: Report): Result<Mode, string> => {
    const reading = optionOf(args, '--baseline');
    const writing = optionOf(args, '--write-baseline');
    const lanePath = optionOf(args, '--lanes');
    for (const option of [reading, writing, lanePath]) {
        if (option.kind === 'err') {
            return option;
        }
    }
    const dir = writing.kind === 'ok' && writing.value !== null ? writing.value : reading.kind === 'ok' ? reading.value : null;
    if (dir === null) {
        return ok({ kind: 'plain' });
    }
    const lanes = loadLanes(lanePath.kind === 'ok' && lanePath.value !== null ? lanePath.value : join(root, 'ci/lanes.json'));
    if (lanes.kind === 'err') {
        return lanes;
    }
    if (writing.kind === 'ok' && writing.value !== null) {
        const written = writeBaseline(dir, report.counts, lanes.value);
        return written.kind === 'err' ? written : ok({ kind: 'written', message: written.value });
    }
    const baseline = loadBaseline(dir, lanes.value);
    return baseline.kind === 'err' ? baseline : ok({ kind: 'ratchet', problems: ratchet(report.counts, baseline.value) });
};
