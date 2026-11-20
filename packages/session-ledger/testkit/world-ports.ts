import {
    instant,
    UNREAD,
    type Chunk,
    type Clock,
    type FollowedSession,
    type HarnessKind,
    type Ids,
    type Instant,
    type Located,
    type Position,
    type RepoResult,
    type SessionReader,
    type SessionSource,
    type Workplaces,
} from '@stateforge-labs/session-ledger';
import type { Behaviour, Run } from './behaviour.ts';
import { minted, sourcePath, text } from './values.ts';

export interface ManualClock extends Clock {
    set(ms: number): void;
}

export type LocatedAnswer = { readonly kind: 'located'; readonly source: string };

export const clockOf = (): ManualClock => {
    let nowMs = 0;
    return {
        now: (): Instant => instant(nowMs),
        set: (ms: number) => {
            nowMs = ms;
        },
    };
};

export const idsOf = (): Ids => {
    let serial = 0;
    return {
        next: () => {
            serial += 1;
            return minted(`id-${serial}`);
        },
    };
};

export interface Probes {
    readonly located: FollowedSession[];
    readonly reads: string[];
    readonly positions: Position[];
    readonly curated: string[];
    readonly budgets: number[];
    readonly writers: number[];
    readonly repos: string[];
}

export interface ReaderScript {
    noReader(): HarnessKind | null;
    carry(from: string, to: string, at: Position): Position;
}

export const sessionsOf = (run: Run, locateOf: (session: FollowedSession) => Behaviour<LocatedAnswer>, readOf: (source: string) => Behaviour<Chunk>, probes: Probes, script: ReaderScript): SessionSource => {
    const readerFor = (harness: HarnessKind): SessionReader | undefined => {
        if (harness === script.noReader()) {
            return undefined;
        }
        return {
            harness,
            locate: async (session: FollowedSession): Promise<Located> => {
                probes.located.push(session);
                const found = await run(locateOf(session));
                return found.kind === 'located' ? { kind: 'located', source: sourcePath(found.source) } : found;
            },
            read: (source: string, was: Position, budget: number) => {
                probes.reads.push(source);
                probes.positions.push(was);
                probes.budgets.push(budget);
                return run(readOf(source));
            },
            carry: (from: Located, to: Located, at: Position) => Promise.resolve(from.kind === 'located' && to.kind === 'located' ? script.carry(from.source, to.source, at) : UNREAD),
        };
    };
    return {
        readerFor,
        unavailableReason: (harness: HarnessKind) => text(`no scripted reader for ${harness}`),
    };
};

export const workplacesOf = (probes: Probes): Workplaces => ({
    repoOf: (cwd: string) => {
        probes.repos.push(cwd);
        return Promise.resolve<RepoResult>({ kind: 'no-repo' });
    },
});
