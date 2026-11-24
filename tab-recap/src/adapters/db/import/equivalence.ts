import { isDeepStrictEqual } from 'node:util';
import { must } from '#src/protocol/result.ts';
import type { Recap } from '#src/ports/recap-records.ts';
import type { LegacyViewFile } from '#src/ports/legacy-store-files.ts';
import type { TabViewRecord } from '#src/ports/tab-views.ts';
import { parseText, textOf, type Text } from '#src/recap/domain/text.ts';
import { usdOf } from '#src/recap/domain/usd.ts';
import { microsOf } from '../run-write.ts';

export type Presence = 'present' | 'absent';

export function canonicalRecap(file: Recap): Recap {
    const costUsd = typeof file.costUsd === 'number' ? file.costUsd : usdOf(0);
    const at = typeof file.at === 'number' ? file.at : null;
    const error = typeof file.error === 'string' ? file.error : null;
    const hasRun = at !== null || error !== null || costUsd > 0;
    return { ...file, at, error, costUsd, running: file.running, backend: typeof file.backend === 'string' ? file.backend : null, language: hasRun ? file.language : textOf('en') };
}

export const holdingOf = (file: Recap): Presence =>
    file.sessions.length > 0 || file.tasks.length > 0 || file.at !== null || file.error !== null || file.costUsd > 0 || file.running || file.backend !== null ? 'present' : 'absent';

export function canonicalView(file: LegacyViewFile): LegacyViewFile {
    return { ...file, column: typeof file.column === 'string' ? file.column : null, daemonVersion: file.daemonVersion ?? null };
}

const inMillionths = (recap: Recap): Recap => ({ ...recap, costUsd: usdOf(microsOf(recap.costUsd)) });

export function recapDifferenceLines(was: Recap, now: Recap | null): readonly Text[] {
    if (now === null) {
        return [must(parseText(`recap ${was.scope}: reads back as nothing`))];
    }
    const left = new Map(Object.entries(inMillionths(was)));
    const right = new Map(Object.entries(inMillionths(now)));
    return [...new Set([...left.keys(), ...right.keys()])].filter((field) => !isDeepStrictEqual(left.get(field), right.get(field))).map((field) => must(parseText(`recap ${was.scope}: ${field} differs`)));
}

export function viewDifferenceLines(was: LegacyViewFile, now: TabViewRecord | null): readonly Text[] {
    if (now === null) {
        return [must(parseText(`view ${was.tab}: reads back as nothing`))];
    }
    const left = new Map(Object.entries(was));
    const right = new Map(Object.entries(now));
    return [...new Set([...left.keys(), ...right.keys()])].filter((field) => !isDeepStrictEqual(left.get(field), right.get(field))).map((field) => must(parseText(`view ${was.tab}: ${field} differs`)));
}
