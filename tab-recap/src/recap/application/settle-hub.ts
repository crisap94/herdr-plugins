// Who is waiting for a lane to settle: herdr's `pane.agent_status_changed` push, fed by the informer, wakes them. While the
// informer is blind (no subscription) the lane's status is polled instead, as the flow always did.
import type { Agents } from '#src/ports/agents.ts';
import type { LaneSettling, Settled } from '#src/ports/lane-settling.ts';
import { isUnknown } from '#src/ports/unknowable.ts';

const READY = new Set(['idle', 'done']);
/** Time for the agent to start working on what was typed before it is first asked how it stands (polling only). */
const SETTLE_MS = 4000;
const POLL_MS = 2000;

export interface SettleHubDeps {
    readonly agents: Pick<Agents, 'status'>;
    /** whether herdr's pushes are arriving */
    listening(): boolean;
    pause(ms: number): Promise<void>;
    now(): number;
}

interface Waiter {
    readonly since: number;
    resolve(settled: Settled): void;
}

export class SettleHub implements LaneSettling {
    private readonly deps: SettleHubDeps;
    private readonly waiters = new Map<string, Set<Waiter>>();
    private readonly last = new Map<string, { readonly status: string; readonly at: number }>();

    constructor(deps: SettleHubDeps) {
        this.deps = deps;
    }

    /** The informer's feed: herdr said `status` for `pane`. */
    heard(pane: string, status: string): void {
        const at = this.deps.now();
        this.last.set(pane, { status, at });
        if (!READY.has(status)) {
            return;
        }
        for (const waiter of this.waiters.get(pane) ?? []) {
            if (at >= waiter.since) {
                waiter.resolve({ kind: 'settled', status });
            }
        }
    }

    async settled(pane: string, since: number, timeoutMs: number): Promise<Settled> {
        const heard = this.last.get(pane);
        if (heard !== undefined && heard.at >= since && READY.has(heard.status)) {
            return { kind: 'settled', status: heard.status };
        }
        if (!this.deps.listening()) {
            return this.polled(pane, timeoutMs);
        }
        const pushed = await this.pushed(pane, since, timeoutMs);
        return pushed.kind === 'settled' ? pushed : this.once(pane);
    }

    private pushed(pane: string, since: number, timeoutMs: number): Promise<Settled> {
        return new Promise((resolve) => {
            const waiters = this.waiters.get(pane) ?? new Set<Waiter>();
            this.waiters.set(pane, waiters);
            const timer = setTimeout(() => { done({ kind: 'timeout' }); }, timeoutMs);
            timer.unref();
            const waiter: Waiter = { since, resolve: (settled) => { done(settled); } };
            const done = (settled: Settled): void => {
                clearTimeout(timer);
                waiters.delete(waiter);
                resolve(settled);
            };
            waiters.add(waiter);
        });
    }

    /** One look at the status, for the lane that may have settled while nothing was heard. */
    private async once(pane: string): Promise<Settled> {
        const state = await this.deps.agents.status(pane);
        return !isUnknown(state) && READY.has(state.status) ? { kind: 'settled', status: state.status } : { kind: 'timeout' };
    }

    private async polled(pane: string, timeoutMs: number): Promise<Settled> {
        await this.deps.pause(SETTLE_MS);
        for (let waited = SETTLE_MS; waited < timeoutMs; waited += POLL_MS) {
            const state = await this.deps.agents.status(pane);
            if (isUnknown(state) || READY.has(state.status)) {
                return { kind: 'settled', status: isUnknown(state) ? 'unknown' : state.status };
            }
            await this.deps.pause(POLL_MS);
        }
        return { kind: 'timeout' };
    }
}
