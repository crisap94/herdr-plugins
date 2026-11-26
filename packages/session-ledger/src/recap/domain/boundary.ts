import { brand, type Brand } from './brand.ts';
import type { Count } from './count.ts';
import type { SessionKey } from './followed-session-shape.ts';
import { instant, type Duration, type Instant } from './time.ts';

export const PLUGIN_WITHIN_MS = 10 * 60_000;

export type BoundaryKind = 'compacted' | 'switched';
export type Trigger = 'auto' | 'manual' | 'plugin';

export type OwnTrigger = 'auto' | 'manual';

export interface SessionMark { readonly key: SessionKey; readonly at: Instant; readonly cursor: Count; readonly tokensBefore?: Count; readonly tokensAfter?: Count; readonly tookMs?: Duration; readonly trigger?: OwnTrigger; }

export interface Planned { readonly kind: BoundaryKind; readonly pane: SessionKey; readonly at: Instant; readonly trigger: Trigger | null; readonly cursor: Count; readonly tokensBefore: Count | null; readonly tokensAfter: Count | null; readonly tookMs: Duration | null; }

type Ordering = -1 | 0 | 1;

function byTime(a: SessionMark, b: SessionMark): Ordering {
    if (a.at === b.at) {
        return 0;
    }
    return a.at < b.at ? -1 : 1;
}

export type Settled = Brand<boolean, 'Settled'>;

export const triggerOf = (at: Instant, asked: readonly Instant[], own: OwnTrigger | null): Trigger => (asked.some((started) => started <= at && at - started <= PLUGIN_WITHIN_MS) ? 'plugin' : own ?? 'auto');

export function compactedFrom(marks: readonly SessionMark[], lastAt: Instant | null, asked: readonly Instant[]): readonly Planned[] {
    return marks.filter((mark) => lastAt === null || mark.at > lastAt).toSorted(byTime).map((mark): Planned => ({
        kind: 'compacted', pane: mark.key, at: mark.at, trigger: triggerOf(mark.at, asked, mark.trigger ?? null), cursor: mark.cursor, tokensBefore: mark.tokensBefore ?? null, tokensAfter: mark.tokensAfter ?? null, tookMs: mark.tookMs ?? null,
    }));
}

export const chapterStart = (at: Instant, sealedStart: Instant): Instant => instant(Math.max(at, sealedStart));

export const settledBefore = (closedAt: Instant | null, boundaryAt: Instant | null): Settled => brand<boolean, 'Settled'>(closedAt !== null && boundaryAt !== null && closedAt < boundaryAt);
