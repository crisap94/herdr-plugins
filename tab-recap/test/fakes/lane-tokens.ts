import type { Done } from '#src/ports/columns.ts';
import type { PaneId } from '#src/recap/domain/ids.ts';
import type { Milliseconds } from '#src/recap/domain/time.ts';
import type { LaneTokenMap, LaneTokenReporter } from '#src/ports/lane-tokens.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { causeOf } from './cause.ts';

export interface Report {
    readonly pane: string;
    readonly tokens: Readonly<Record<string, string | null>>;
    readonly ttlMs: number;
}

export class RecordingTokens implements LaneTokenReporter {
    readonly reports: Report[] = [];
    failing = false;

    async report(pane: PaneId, tokens: LaneTokenMap, ttlMs: Milliseconds): Promise<Done> {
        this.reports.push({ pane: String(pane), tokens: Object.fromEntries(tokens), ttlMs: Number(ttlMs) });
        return this.failing ? unknown({ why: 'unreachable', detail: causeOf('fake') }) : { kind: 'done' };
    }
}
