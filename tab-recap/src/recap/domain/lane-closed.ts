import { brand, type Brand } from '@stateforge-labs/session-ledger';
import type { ParseFailure } from '@stateforge-labs/session-ledger';
import { err, must, ok, type Result } from '@stateforge-labs/session-ledger';

export type LaneClosedWhy = Brand<string, 'LaneClosedWhy'>;

export function parseLaneClosedWhy(input: unknown): Result<LaneClosedWhy, ParseFailure> {
    if (typeof input !== 'string') {
        return err({ kind: 'not-a-string' });
    }
    if (input !== 'lane closed') {
        return err({ kind: 'out-of-range' });
    }
    return ok(brand<string, 'LaneClosedWhy'>(input));
}

export const LANE_CLOSED: LaneClosedWhy = must(parseLaneClosedWhy('lane closed'));

export const CLOSE_POINTS = ['status-check', 'before-writer', 'after-writer', 'before-rewrite', 'before-typing'] as const;

export type ClosePoint = (typeof CLOSE_POINTS)[number];
