import { parseDuration } from './time.ts';
import type { Duration } from './time.ts';

export interface TurnPacing { readonly kind: 'turn' }

export interface SmartPacing { readonly kind: 'smart'; readonly quiet: Duration; readonly maxWait: Duration }

export type Pacing = TurnPacing | SmartPacing;

export type Shown = 'shown' | 'hidden';

export const PACING_TURN: Pacing = { kind: 'turn' };

export function parsePacing(mode: unknown, quietMs: unknown, maxWaitMs: unknown): Pacing {
    const quiet = parseDuration(quietMs);
    const maxWait = parseDuration(maxWaitMs);
    if (mode !== 'smart' || quiet.kind === 'err' || maxWait.kind === 'err') {
        return PACING_TURN;
    }
    if (!Number.isSafeInteger(quiet.value) || !Number.isSafeInteger(maxWait.value) || quiet.value <= 0 || maxWait.value <= 0) {
        return PACING_TURN;
    }
    return { kind: 'smart', quiet: quiet.value, maxWait: maxWait.value };
}
