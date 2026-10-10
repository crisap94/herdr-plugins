import { isDeepStrictEqual } from 'node:util';
import type { TabRecap } from '#src/ports/recap-records.ts';
import type { TabView } from '#src/ports/tab-views.ts';
import { microsOf } from '../run-write.ts';

export function canonicalRecap(file: TabRecap): TabRecap {
    const costUsd = typeof file.costUsd === 'number' ? file.costUsd : 0;
    const at = typeof file.at === 'number' ? file.at : null;
    const error = typeof file.error === 'string' ? file.error : null;
    const hasRun = at !== null || error !== null || costUsd > 0;
    return { ...file, at, error, costUsd, running: file.running, backend: typeof file.backend === 'string' ? file.backend : null, language: hasRun ? file.language : 'en' };
}

export const holdsAnything = (file: TabRecap): boolean =>
    file.lanes.length > 0 || file.tasks.length > 0 || file.at !== null || file.error !== null || file.costUsd > 0 || file.running || file.backend !== null;

export function canonicalView(file: TabView): TabView {
    return { ...file, column: typeof file.column === 'string' ? file.column : null, daemonVersion: file.daemonVersion ?? null };
}

function fieldsDiffering(was: object, now: object): readonly string[] {
    const left = was as Readonly<Record<string, unknown>>;
    const right = now as Readonly<Record<string, unknown>>;
    return [...new Set([...Object.keys(left), ...Object.keys(right)])].filter((key) => !isDeepStrictEqual(left[key], right[key]));
}

const inMillionths = (recap: TabRecap): TabRecap => ({ ...recap, costUsd: microsOf(recap.costUsd) });

export function recapDifferences(was: TabRecap, now: TabRecap | null): readonly string[] {
    if (now === null) {
        return [`recap ${was.tab}: reads back as nothing`];
    }
    return fieldsDiffering(inMillionths(was), inMillionths(now)).map((field) => `recap ${was.tab}: ${field} differs`);
}

export function viewDifferences(was: TabView, now: TabView | null): readonly string[] {
    return now === null ? [`view ${was.tab}: reads back as nothing`] : fieldsDiffering(was, now).map((field) => `view ${was.tab}: ${field} differs`);
}
