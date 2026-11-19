import type { Board } from '../../board.ts';
import type { PaneId } from '../../ids.ts';
import { duration, elapsed } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';
import type { Duration, Instant } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';
import { REGISTERED_KINDS, kindsWith } from '@stateforge-labs/session-ledger/unstable/recap/domain/registered-kinds.ts';
import type { RegisteredKindTable } from '@stateforge-labs/session-ledger/unstable/recap/domain/registered-kinds.ts';

export const ANY_KIND = '*';

export interface Policy {
    readonly kinds: readonly string[];
    readonly minTabCols: number;
    readonly reopenLimit: number;
    readonly reopenWindow: Duration;
    readonly giveUpFor: Duration;
    readonly closeGrace: Duration;
    readonly onlyTabs: readonly string[];
}

export function defaultPolicyKinds<T extends RegisteredKindTable>(table: T): readonly (keyof T)[] {
    return kindsWith(table, 'defaultPolicy');
}

export const DEFAULT_POLICY: Policy = {
    kinds: defaultPolicyKinds(REGISTERED_KINDS),
    minTabCols: 110,
    reopenLimit: 3,
    reopenWindow: duration(120_000),
    giveUpFor: duration(600_000),
    closeGrace: duration(30_000),
    onlyTabs: [],
};

export const wantsKind = (policy: Policy, agent: string): boolean => policy.kinds.includes(ANY_KIND) || policy.kinds.includes(agent);

export function screenKindsOf(setting: string | undefined): readonly string[] {
    const names = (setting ?? '').toLowerCase().split(/[\s,]+/).map((name) => name.replace(/[^a-z0-9_-]/g, '')).filter((name) => name !== '');
    return names.includes('all') ? [ANY_KIND] : [...new Set(names)];
}

export function screenSetting(setting: string | undefined): string {
    const kinds = screenKindsOf(setting);
    return kinds.includes(ANY_KIND) ? 'all' : kinds.join(',');
}

export function lingering(board: Board, pane: PaneId, now: Instant, policy: Policy): boolean {
    const since = board.closing.get(pane);
    return since !== undefined && elapsed(since, now) < policy.closeGrace;
}
