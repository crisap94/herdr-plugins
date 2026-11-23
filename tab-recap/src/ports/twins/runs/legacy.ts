import type { Instant } from '#src/recap/domain/time.ts';
import type { BackgroundItem } from '#src/recap/domain/in-flight.ts';
import type { Lane } from '#src/recap/domain/lane.ts';

export type InFlightReading =
    | { readonly kind: 'not-started'; readonly why: string }
    | { readonly kind: 'count'; readonly count: number; readonly background: readonly BackgroundItem[] }
    | { readonly kind: 'unknown'; readonly why: string };

export interface InFlight {
    read(lane: Lane): Promise<InFlightReading>;
}

export type Settled = { readonly kind: 'settled'; readonly status: string } | { readonly kind: 'timeout' };

export interface LaneSettling {
    settled(pane: string, since: Instant, timeoutMs: number): Promise<Settled>;
}

export interface RunResult {
    readonly code: number;
    readonly stdout: string;
    readonly stderr: string;
    readonly timedOut: boolean;
}

export interface RunOptions {
    readonly input: string;
    readonly timeoutMs: number;
    readonly cwd: string;
    readonly env: NodeJS.ProcessEnv;
    readonly killAfterMs?: number;
}

export type Runner = (command: string, args: readonly string[], options: RunOptions) => Promise<RunResult>;

export interface ProcessControl {
    readonly run: Runner;
    readonly killTree: (pid: number, force: boolean) => void;
}

export interface VisibilityRequest {
    readonly target: string;
    readonly hidden: boolean | 'toggle';
}
