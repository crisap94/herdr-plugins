// A boundary: where a session breaks — an agent compacted its context, or a new transcript began in the same pane. Pure: marks and times in, what to record out.

/** A compaction the plugin asked for counts as the cause of a mark that follows it by at most this long. */
export const PLUGIN_WITHIN_MS = 10 * 60_000;

export type BoundaryKind = 'compacted' | 'switched';
/** Who started a compaction: the `plugin`, the operator typing it in the agent (`manual`), or the agent itself (`auto`). */
export type Trigger = 'auto' | 'manual' | 'plugin';

/** The agent's own word for a compaction's trigger, when its record says one. */
export type OwnTrigger = 'auto' | 'manual';

/** A compaction an agent's own records show, resolved to a time (a record that carries none is read at the time of the read). */
export interface LaneMark {
    readonly pane: string;
    readonly at: number;
    /** where the read that found it ended */
    readonly cursor: number;
    readonly tokensBefore?: number;
    readonly tokensAfter?: number;
    readonly tookMs?: number;
    /** the agent's own word, when its record states one */
    readonly trigger?: OwnTrigger;
}

/** What one boundary row says; `trigger` is null for a switch. */
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

/** `plugin` when the plugin started a compaction of the lane in the ten minutes before `at`; else `own`, the agent's word (null when its record says none); else `auto`. */
export function triggerOf(at: number, asked: readonly number[], own: OwnTrigger | null): Trigger {
    return asked.some((started) => started <= at && at - started <= PLUGIN_WITHIN_MS) ? 'plugin' : own ?? 'auto';
}

/**
 * The boundaries the marks of one lane add: those newer than the lane's last boundary (`lastAt`, null when it has none), oldest first.
 * `asked` are the times the plugin started a compaction of the lane.
 */
export function compactedFrom(marks: readonly LaneMark[], lastAt: number | null, asked: readonly number[]): readonly Planned[] {
    return marks
        .filter((mark) => lastAt === null || mark.at > lastAt)
        .toSorted((a, b) => a.at - b.at)
        .map((mark) => ({
            kind: 'compacted', pane: mark.pane, at: mark.at, trigger: triggerOf(mark.at, asked, mark.trigger ?? null), cursor: mark.cursor,
            tokensBefore: mark.tokensBefore ?? null, tokensAfter: mark.tokensAfter ?? null, tookMs: mark.tookMs ?? null,
        }));
}

/** The new chapter starts at the boundary's time, but never before the chapter it seals (a record older than the tab's first sight). */
export const chapterStart = (at: number, sealedStart: number): number => Math.max(at, sealedStart);

/** Whether a fact closed at `closedAt` (null: still open) was closed before the lane's last boundary (`boundaryAt`, null when it has none). */
export const settledBefore = (closedAt: number | null, boundaryAt: number | null): boolean => closedAt !== null && boundaryAt !== null && closedAt < boundaryAt;
