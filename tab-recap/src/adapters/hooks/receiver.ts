import type { Engine, ScopeId, SessionKey } from '@stateforge-labs/session-ledger';
import { keyOf, ledgerDirectoryOf, ledgerSessionOf, scopeOf } from '#src/engine/engine-adapter.ts';
import type { TabRecaps } from '#src/engine/tab-recaps.ts';
import { parseLine, parseMessage, type Line } from '#src/daemon/slots.ts';
import type { Clock } from '#src/ports/clock.ts';
import type { Observation } from '#src/recap/domain/fold.ts';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { textOf } from '#src/recap/domain/text.ts';
import { parseSessionId, type PaneId, type SessionId, type TabId } from '#src/recap/domain/ids.ts';
import type { HookAnswer, HookCall, HookHarness, HookReceiver, PreCompactAnswer } from '#src/wire/hooks/contract.ts';
import { PRE_COMPACT_HOLD_REASON } from '#src/wire/hooks/contract.ts';
import type { PreCompactCall, PreCompactReceiver } from '#src/adapters/hooks/endpoint.ts';
import type { IdleClaim } from '#src/recap/application/autocompact.ts';
import { turnSignalOf } from '#src/wire/hooks/turn-signal.ts';
import type { PreCompacts } from '#src/adapters/hooks/pre-compacts.ts';
import type { TurnEnds } from '#src/adapters/hooks/turn-ends.ts';

export interface Followed {
    readonly tab: TabId;
    readonly pane: PaneId;
    readonly lane: Lane;
}

export type RestoreMode = 'on' | 'off';

export interface ReceiverDeps {
    followed(harness: HookHarness, session: SessionId): Followed | null;
    lanesOf(tab: TabId): readonly Lane[];
    observe(observation: Observation): void;
    recaps: Pick<TabRecaps, 'turnEnded'>;
    engine: Pick<Engine, 'sessionStarted' | 'compacted'>;
    turnEnds: TurnEnds;
    preCompacts: PreCompacts;
    claimIdle(lane: Lane): IdleClaim;
    restoreMode(): RestoreMode;
    clock: Clock;
    log(line: Line): void;
}

const NOTHING: HookAnswer = { kind: 'nothing' };
const PRE_COMPACT_NOTHING: PreCompactAnswer = { kind: 'nothing' };

const stopped = (deps: ReceiverDeps, followed: Followed): void => {
    const signal = turnSignalOf(followed.lane, deps.turnEnds.endedAt(followed.pane), deps.clock.now());
    if (signal.kind === 'as-status') {
        deps.observe({ kind: 'status', pane: followed.pane, status: textOf('idle') });
    }
    if (signal.kind === 'direct') {
        deps.recaps.turnEnded(followed.tab, deps.lanesOf(followed.tab), 'turn-ended');
    }
};

const sessionStartedAnswer = (deps: ReceiverDeps, call: HookCall, session: SessionId, scope: ScopeId, key: SessionKey): HookAnswer => {
    if (call.source === 'compact') {
        const facts = deps.engine.compacted(scope, key);
        if (deps.restoreMode() !== 'on') {
            return NOTHING;
        }
        const held = deps.preCompacts.served(session);
        const text = held.kind === 'offered' ? held.text : facts;
        return held.kind === 'typed' || text === '' ? NOTHING : { kind: 'context', text };
    }
    const read = call.cwd === null ? null : parseDirectory(call.cwd);
    const cwd = read !== null && read.kind === 'ok' ? ledgerDirectoryOf(read.value) : null;
    deps.engine.sessionStarted(scope, key, { session: ledgerSessionOf(session), cwd });
    return NOTHING;
};

const preCompactAnswer = (deps: ReceiverDeps, call: PreCompactCall): PreCompactAnswer => {
    if (call.session === null) {
        return PRE_COMPACT_NOTHING;
    }
    const session = parseSessionId(call.session);
    if (session.kind === 'err') {
        return PRE_COMPACT_NOTHING;
    }
    const followed = deps.followed('claude', session.value);
    if (followed === null) {
        return PRE_COMPACT_NOTHING;
    }
    deps.preCompacts.mark(session.value, deps.clock.now());
    if (call.trigger !== 'auto') {
        return PRE_COMPACT_NOTHING;
    }
    return deps.claimIdle(followed.lane) === 'claimed' ? { kind: 'hold', reason: PRE_COMPACT_HOLD_REASON } : PRE_COMPACT_NOTHING;
};

export function createReceiver(deps: ReceiverDeps): HookReceiver & PreCompactReceiver {
    const route = (call: HookCall): HookAnswer => {
        if (call.session === null || call.kind === 'other') {
            return NOTHING;
        }
        const session = parseSessionId(call.session);
        if (session.kind === 'err') {
            return NOTHING;
        }
        const followed = deps.followed(call.harness, session.value);
        if (followed === null) {
            return NOTHING;
        }
        const scope = scopeOf(followed.tab);
        const key = keyOf(followed.pane);
        if (scope === null || key === null) {
            return NOTHING;
        }
        switch (call.kind) {
            case 'stop':
                stopped(deps, followed);
                return NOTHING;
            case 'session-start':
                return sessionStartedAnswer(deps, call, session.value, scope, key);
            case 'pre-compact':
                deps.preCompacts.mark(session.value, deps.clock.now());
                return NOTHING;
            default:
                return NOTHING;
        }
    };

    return {
        handle: (call: HookCall): HookAnswer => {
            try {
                return route(call);
            } catch (error) {
                deps.log(parseLine(`hook receiver: ${parseMessage(error)}`));
                return NOTHING;
            }
        },
        preCompact: (call: PreCompactCall): PreCompactAnswer => {
            try {
                return preCompactAnswer(deps, call);
            } catch (error) {
                deps.log(parseLine(`hook receiver: ${parseMessage(error)}`));
                return PRE_COMPACT_NOTHING;
            }
        },
    };
}
