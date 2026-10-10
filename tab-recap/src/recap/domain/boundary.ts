export const PLUGIN_WITHIN_MS = 10 * 60_000;

export type BoundaryKind = 'compacted' | 'switched';
export type Trigger = 'auto' | 'manual' | 'plugin';

export type OwnTrigger = 'auto' | 'manual';

export interface LaneMark {
    readonly pane: string;
    readonly at: number;
    readonly cursor: number;
    readonly tokensBefore?: number;
    readonly tokensAfter?: number;
    readonly tookMs?: number;
    readonly trigger?: OwnTrigger;
}

export interface Planned {
    readonly kind: BoundaryKind;
    readonly pane: string;
    readonly at: number;
    readonly trigger: Trigger | null;
    readonly cursor: number;
    readonly tokensBefore: number | null;
    readonly tokensAfter: number | null;
    readonly tookMs: number | null;
}

export function triggerOf(at: number, asked: readonly number[], own: OwnTrigger | null): Trigger {
    return asked.some((started) => started <= at && at - started <= PLUGIN_WITHIN_MS) ? 'plugin' : own ?? 'auto';
}

export function compactedFrom(marks: readonly LaneMark[], lastAt: number | null, asked: readonly number[]): readonly Planned[] {
    return marks
        .filter((mark) => lastAt === null || mark.at > lastAt)
        .toSorted((a, b) => a.at - b.at)
        .map((mark) => ({
            kind: 'compacted', pane: mark.pane, at: mark.at, trigger: triggerOf(mark.at, asked, mark.trigger ?? null), cursor: mark.cursor,
            tokensBefore: mark.tokensBefore ?? null, tokensAfter: mark.tokensAfter ?? null, tookMs: mark.tookMs ?? null,
        }));
}

export const chapterStart = (at: number, sealedStart: number): number => Math.max(at, sealedStart);

export const settledBefore = (closedAt: number | null, boundaryAt: number | null): boolean => closedAt !== null && boundaryAt !== null && closedAt < boundaryAt;
