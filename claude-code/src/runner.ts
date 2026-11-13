import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Engine } from '../../tab-recap/src/recap/application/engine.ts';
import type { Followed } from './compose.ts';
import type { SessionLock } from './lock.ts';

export const SETTLE_MS = 2500;
export const MAX_ROUNDS = 3;
export const LOG_FILE = 'claude-code.log';

export interface OpenedEngine {
    readonly engine: Pick<Engine, 'refresh'>;
    close(): void;
}

export type RunnerOpening = { readonly kind: 'opened'; readonly opened: OpenedEngine } | { readonly kind: 'refused'; readonly detail: string };

export interface RunnerPlugs {
    readonly lock: SessionLock;
    readonly followed: Followed;
    readonly settle: () => Promise<void>;
    readonly open: () => RunnerOpening;
    readonly log: (line: string) => void;
    readonly rounds?: number;
}

export type RunnerResult =
    | { readonly kind: 'ran'; readonly rounds: number }
    | { readonly kind: 'marked' }
    | { readonly kind: 'failed'; readonly rounds: number; readonly detail: string };

export const sleepFor = (ms: number): (() => Promise<void>) => (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

export function fileLog(stateDir: string, now: () => number = Date.now): (line: string) => void {
    return (line: string): void => {
        try {
            mkdirSync(stateDir, { recursive: true });
            appendFileSync(join(stateDir, LOG_FILE), `${new Date(now()).toISOString()} ${line}\n`);
        } catch {
            return;
        }
    };
}

const detailOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

class Rounds {
    done = 0;
    private opened: OpenedEngine | null = null;
    private readonly plugs: RunnerPlugs;
    private readonly limit: number;

    constructor(plugs: RunnerPlugs) {
        this.plugs = plugs;
        this.limit = Math.max(1, plugs.rounds ?? MAX_ROUNDS);
    }

    get left(): boolean {
        return this.done < this.limit;
    }

    async underLock(): Promise<void> {
        const { lock, followed, settle } = this.plugs;
        do {
            lock.takeDirty();
            await settle();
            const engine = this.engine();
            await engine.refresh(followed.scope, [followed.session]);
            this.done += 1;
        } while (lock.isDirty() && this.left);
    }

    private engine(): Pick<Engine, 'refresh'> {
        if (this.opened === null) {
            const opening = this.plugs.open();
            if (opening.kind === 'refused') {
                throw new Error(opening.detail);
            }
            this.opened = opening.opened;
        }
        return this.opened.engine;
    }

    close(): void {
        const opened = this.opened;
        this.opened = null;
        opened?.close();
    }
}

async function runRounds(plugs: RunnerPlugs, rounds: Rounds): Promise<RunnerResult> {
    while (rounds.left) {
        const taken = plugs.lock.take();
        if (taken.kind === 'held') {
            plugs.lock.markDirty();
            return rounds.done === 0 ? { kind: 'marked' } : { kind: 'ran', rounds: rounds.done };
        }
        if (taken.stole !== null) {
            plugs.log(`took over the lock of ${plugs.followed.session.session ?? ''} from pid ${taken.stole.pid}`);
        }
        try {
            await rounds.underLock();
        } finally {
            taken.release();
        }
        if (!plugs.lock.isDirty()) {
            break;
        }
    }
    return { kind: 'ran', rounds: rounds.done };
}

export async function runAfterStop(plugs: RunnerPlugs): Promise<RunnerResult> {
    const rounds = new Rounds(plugs);
    try {
        return await runRounds(plugs, rounds);
    } catch (error) {
        const detail = detailOf(error);
        plugs.log(`refresh of ${plugs.followed.session.session ?? ''} failed after ${rounds.done} round(s): ${detail}`);
        return { kind: 'failed', rounds: rounds.done, detail };
    } finally {
        try {
            rounds.close();
        } catch (error) {
            plugs.log(`closing the ledger failed: ${detailOf(error)}`);
        }
    }
}
