import { countOf, instant, must, parseCount, parseUsd } from '@stateforge-labs/session-ledger';
import type { DecisionDraft } from '@stateforge-labs/session-ledger';
import { agentKind, paneId, tabId } from '#test/support/ids.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { FollowedSession } from '#src/recap/domain/lane.ts';
import { seenLane } from '#test/support/seen.ts';
import type { World } from '#test/autocompact-world.ts';

export const MINUTE = 60_000;

export const draftOf = (over: Partial<DecisionDraft> = {}): DecisionDraft => ({
    scope: tabId('w1:t1'), key: paneId('w1:p1'), agent: agentKind('claude'), at: instant(0), mode: 'on', share: countOf(60), tokens: must(parseCount(1)), window: must(parseCount(2)), gate: 'ask', verdict: 'wait', askedVerdict: 'wait', answers: new Map(), coverage: null, coverageOutcome: null, coverageMs: null, coverageCostUsd: null, laneStatus: null, decider: null, costUsd: must(parseUsd(0)), tookMs: null, why: null, ...over,
});

export const laneAt = (pane: string, status = 'idle', agent = 'claude'): FollowedSession => laneFrom(seenLane({ paneId: pane, tabId: 'w1:t1', workspaceId: 'w1', agent, status }));

export const skipsOf = (w: World): unknown[] => w.store.decisions.skips().map((skip) => [skip.gate, skip.share, skip.detail]);
