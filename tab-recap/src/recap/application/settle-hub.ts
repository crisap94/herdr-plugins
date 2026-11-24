import type { AgentPanes } from '#src/ports/agents.ts';
import type { LaneSettler, Settling } from '#src/ports/lane-settling.ts';
import { isUnknown } from '@stateforge-labs/session-ledger';
import { uncheckedMilliseconds, type SessionKey } from '#src/recap/domain/ids.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import { laneStatus, READY, type LaneStatus } from '#src/recap/domain/status.ts';
import type { Instant, Milliseconds } from '@stateforge-labs/session-ledger';

const SETTLE_MS = 4000;
const POLL_MS = 2000;
const SETTLE = uncheckedMilliseconds(SETTLE_MS);
const POLL = uncheckedMilliseconds(POLL_MS);

export interface SettleHubDeps {
    readonly agents: Pick<AgentPanes, 'status'>;
    listening(): Presence;
    pause(ms: Milliseconds): Promise<void>;
    now(): Instant;
}

interface Waiter {
    readonly since: Instant;
    resolve(settled: Settling): void;
}

interface Heard {
    readonly status: LaneStatus;
    readonly at: Instant;
}

export class SettleHub implements LaneSettler {
    private readonly deps: SettleHubDeps;
    private readonly waiters = new Map<SessionKey, Set<Waiter>>();
    private readonly last = new Map<SessionKey, Heard>();

    constructor(deps: SettleHubDeps) {
        this.deps = deps;
    }

    heard(pane: SessionKey, status: LaneStatus): void {
        const at = this.deps.now();
        this.last.set(pane, { status: laneStatus(status), at });
        if (!READY.has(status)) {
            return;
        }
        for (const waiter of this.waiters.get(pane) ?? []) {
            if (at >= waiter.since) {
                waiter.resolve({ kind: 'settled', status: laneStatus(status) });
            }
        }
    }

    async settled(pane: SessionKey, since: Instant, timeoutMs: Milliseconds): Promise<Settling> {
        const heard = this.last.get(pane);
        if (heard !== undefined && heard.at >= since && READY.has(heard.status)) {
            return { kind: 'settled', status: heard.status };
        }
        if (this.deps.listening() === 'absent') {
            return this.polled(pane, timeoutMs);
        }
        const pushed = await this.pushed(pane, since, timeoutMs);
        return pushed.kind === 'settled' ? pushed : this.once(pane);
    }

    private pushed(pane: SessionKey, since: Instant, timeoutMs: Milliseconds): Promise<Settling> {
        return new Promise((resolve) => {
            const waiters = this.waiters.get(pane) ?? new Set<Waiter>();
            this.waiters.set(pane, waiters);
            const timer = setTimeout(() => { done({ kind: 'timeout' }); }, timeoutMs);
            timer.unref();
            const waiter: Waiter = { since, resolve: (settled) => { done(settled); } };
            const done = (settled: Settling): void => {
                clearTimeout(timer);
                waiters.delete(waiter);
                resolve(settled);
            };
            waiters.add(waiter);
        });
    }

    private async once(pane: SessionKey): Promise<Settling> {
        const state = await this.deps.agents.status(pane);
        return !isUnknown(state) && READY.has(state.status) ? { kind: 'settled', status: state.status } : { kind: 'timeout' };
    }

    private async polled(pane: SessionKey, timeoutMs: Milliseconds): Promise<Settling> {
        await this.deps.pause(SETTLE);
        for (let waited: number = SETTLE_MS; waited < timeoutMs; waited += POLL_MS) {
            const state = await this.deps.agents.status(pane);
            if (isUnknown(state) || READY.has(state.status)) {
                return { kind: 'settled', status: isUnknown(state) ? 'unknown' : state.status };
            }
            await this.deps.pause(POLL);
        }
        return { kind: 'timeout' };
    }
}
