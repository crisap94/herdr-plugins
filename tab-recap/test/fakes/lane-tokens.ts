import type { Done } from '#src/ports/columns.ts';
import type { LaneTokens } from '#src/ports/lane-tokens.ts';
import { unknown } from '#src/ports/unknowable.ts';

export interface Report {
    readonly pane: string;
    readonly tokens: Readonly<Record<string, string | null>>;
    readonly ttlMs: number;
}

export class RecordingTokens implements LaneTokens {
    readonly reports: Report[] = [];
    failing = false;

    async report(pane: string, tokens: Readonly<Record<string, string | null>>, ttlMs: number): Promise<Done> {
        this.reports.push({ pane, tokens, ttlMs });
        return this.failing ? unknown({ why: 'unreachable', detail: 'fake' }) : { kind: 'done' };
    }
}
