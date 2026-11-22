import type { AgentPanes } from '#src/ports/agents.ts';
import type { LaneSettling, Settled } from '#src/ports/lane-settling.ts';
import { isUnknown, unknown } from '#src/ports/unknowable.ts';
import { parsePaneId } from '#src/recap/domain/ids.ts';
import { textOf } from '#src/recap/domain/text.ts';
import { READY } from '#src/recap/domain/status.ts';
import type { Instant } from '#src/recap/domain/time.ts';

const SETTLE_MS = 4000;
const POLL_MS = 2000;

export interface SettleHubDeps {
    readonly agents: Pick<AgentPanes, 'status'>;
    listening(): boolean;
    pause(ms: number): Promise<void>;
    now(): number;
}

interface Waiter {
    readonly since: number;
    resolve(settled: Settled): void;
}

interface Heard {
    readonly status: string;
    readonly at: number;
}

export class SettleHub implements LaneSettling {
    private readonly deps: SettleHubDeps;
    private readonly waiters = new Map<string, Set<Waiter>>();
    private readonly last = new Map<string, Heard>();

    constructor(deps: SettleHubDeps) {
        this.deps = deps;
    }

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

    async settled(pane: string, since: Instant, timeoutMs: number): Promise<Settled> {
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

    private async once(pane: string): Promise<Settled> {
        const id = parsePaneId(pane);
        const state = id.kind === 'ok' ? await this.deps.agents.status(id.value) : unknown({ why: 'not-found', what: textOf(`agent ${pane}`) });
        return !isUnknown(state) && READY.has(state.status) ? { kind: 'settled', status: state.status } : { kind: 'timeout' };
    }

    private async polled(pane: string, timeoutMs: number): Promise<Settled> {
        await this.deps.pause(SETTLE_MS);
        for (let waited = SETTLE_MS; waited < timeoutMs; waited += POLL_MS) {
            const id = parsePaneId(pane);
            const state = id.kind === 'ok' ? await this.deps.agents.status(id.value) : unknown({ why: 'not-found', what: textOf(`agent ${pane}`) });
            if (isUnknown(state) || READY.has(state.status)) {
                return { kind: 'settled', status: isUnknown(state) ? 'unknown' : state.status };
            }
            await this.deps.pause(POLL_MS);
        }
        return { kind: 'timeout' };
    }
}
