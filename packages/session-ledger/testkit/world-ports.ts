import {
    instant,
    type Chunk,
    type Clock,
    type FollowedSession,
    type HarnessKind,
    type Ids,
    type Instant,
    type Position,
    type RepoResult,
    type SessionReader,
    type SessionSource,
    type Workplaces,
} from '@stateforge-labs/session-ledger';
import type { Behaviour, Run } from './behaviour.ts';

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
            return `id-${serial}`;
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

export const sessionsOf = (run: Run, locateOf: (session: FollowedSession) => Behaviour<LocatedAnswer>, readOf: (source: string) => Behaviour<Chunk>, probes: Probes, noReader: () => HarnessKind | null): SessionSource => {
    const readerFor = (harness: HarnessKind): SessionReader | undefined => {
        if (harness === noReader()) {
            return undefined;
        }
        return {
            harness,
            locate: (session: FollowedSession) => {
                probes.located.push(session);
                return run(locateOf(session));
            },
            read: (source: string, was: Position, budget: number) => {
                probes.reads.push(source);
                probes.positions.push(was);
                probes.budgets.push(budget);
                return run(readOf(source));
            },
        };
    };
    return {
        readerFor,
        unavailableReason: (harness: HarnessKind) => `no scripted reader for ${harness}`,
    };
};

export const workplacesOf = (probes: Probes): Workplaces => ({
    repoOf: (cwd: string) => {
        probes.repos.push(cwd);
        return Promise.resolve<RepoResult>({ kind: 'no-repo' });
    },
});
