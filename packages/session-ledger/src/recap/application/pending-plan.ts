import type { LegacyFollowedSession, SessionKey } from '#src/recap/domain/followed-session-shape.ts';
import type { RecapCause } from '#src/recap/domain/recap-cause.ts';
import type { Debounce } from '#src/recap/domain/debounce.ts';
import type { Shown, SmartPacing } from '#src/recap/domain/pacing.ts';
import { duration, instant, type Duration, type Instant } from '#src/recap/domain/time.ts';

const TURN_SETTLE_MS = 2500;

export type Urge = 'forced' | 'paced';

export interface AfterStart { readonly kind: 'after'; readonly delay: Duration }

export interface AtStart { readonly kind: 'at'; readonly deadline: Instant }

export type Start = AfterStart | AtStart;

export interface Pending { readonly lanes: readonly LegacyFollowedSession[]; readonly cause: RecapCause; readonly urge: Urge; readonly start: Start; readonly burst: Instant | null }

export interface PlanSlot { pending: Pending | null; lastStart: Instant | null; lastLanes: ReadonlySet<SessionKey> }

export interface PacePlan { readonly pacing: SmartPacing; readonly shown: Shown; readonly now: Instant }

export const AT_ONCE: AfterStart = { kind: 'after', delay: duration(0) };

const urgeOf = (cause: RecapCause): Urge => cause === 'turn-ended' ? 'paced' : 'forced';

function stronger(previous: Pending | null, next: Pending): Pending {
    return previous !== null && previous.urge === 'forced' && next.urge === 'paced' ? { ...previous, lanes: next.lanes } : next;
}

const keyOf = (seat: LegacyFollowedSession): SessionKey => seat.key;

export function laneSet(lanes: readonly LegacyFollowedSession[]): ReadonlySet<SessionKey> {
    return new Set(lanes.map(keyOf));
}

export function pendingOf(slot: PlanSlot, lanes: readonly LegacyFollowedSession[], cause: RecapCause, debounce: Debounce, clock: () => Instant): Pending {
    switch (debounce.kind) {
        case 'off':
            return { lanes, cause, urge: urgeOf(cause), start: { kind: 'after', delay: duration(cause === 'turn-ended' ? TURN_SETTLE_MS : 0) }, burst: null };
        case 'window': {
            const now = clock();
            const lastStart = slot.lastStart;
            const next = laneSet(lanes);
            const same = slot.lastLanes.size === next.size && [...slot.lastLanes].every((key) => next.has(key));
            const urge: Urge = urgeOf(cause) === 'forced' || lastStart === null || !same ? 'forced' : 'paced';
            const deadline = lastStart === null || urge === 'forced' ? now : instant(Math.max(lastStart + debounce.window, now + TURN_SETTLE_MS));
            return stronger(slot.pending, { lanes, cause, urge, start: { kind: 'at', deadline }, burst: null });
        }
        default: {
            const exhaustive: never = debounce;
            return exhaustive;
        }
    }
}

function unionOf(previous: readonly LegacyFollowedSession[], next: readonly LegacyFollowedSession[]): readonly LegacyFollowedSession[] {
    const fresh = laneSet(next);
    return [...previous.filter((seat) => !fresh.has(keyOf(seat))), ...next];
}

export function pacedOf(slot: PlanSlot, lanes: readonly LegacyFollowedSession[], cause: RecapCause, plan: PacePlan): Pending {
    const { pacing, shown, now } = plan;
    const previous = slot.pending;
    const union = previous === null ? lanes : unionOf(previous.lanes, lanes);
    if (urgeOf(cause) === 'forced') return { lanes: union, cause, urge: 'forced', start: AT_ONCE, burst: null };
    if (previous !== null && previous.urge === 'forced') return { ...previous, lanes: union };
    const burst = previous?.burst ?? now;
    if (lanes.some((seat) => seat.status === 'blocked')) return { lanes: union, cause, urge: 'paced', start: { kind: 'at', deadline: instant(now + TURN_SETTLE_MS) }, burst };
    const cap = burst + pacing.maxWait;
    if (shown === 'hidden') return { lanes: union, cause, urge: 'paced', start: { kind: 'at', deadline: instant(cap) }, burst };
    return { lanes: union, cause, urge: 'paced', start: { kind: 'at', deadline: instant(Math.min(now + pacing.quiet, cap)) }, burst };
}
