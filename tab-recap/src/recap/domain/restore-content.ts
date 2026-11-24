import type { HandoffBody } from './handoff-content.ts';
import type { Instant } from '@stateforge-labs/session-ledger';

export interface RestoreBody extends Pick<HandoffBody, 'groups' | 'withheld'> {
    readonly kind: 'content';
    readonly lastRunAt: Instant;
}

export interface RestoreNothing {
    readonly kind: 'empty';
}

export type RestoreContent = RestoreBody | RestoreNothing;
