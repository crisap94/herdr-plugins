import { ok, type Result } from '#src/protocol/result.ts';
import { parseCount } from './count.ts';
import type { Count } from './count.ts';
import { parseDirectory } from './directory.ts';
import type { Directory } from './directory.ts';
import type { PaneId } from './ids.ts';
import type { Lane } from './lane.ts';
import type { ParseFailure } from './parse-failure.ts';
import type { PorcelainReading } from './porcelain.ts';
import { endsTurn } from './status.ts';
import type { LaneStatus } from './status.ts';
import { parseText } from './text.ts';
import type { Text } from './text.ts';
import type { Duration, Instant } from './time.ts';

export type StatusTier = 'tracked' | 'full';

export type StatusTrigger = 'attached' | 'git-dir' | 'turn-ended' | 'safety';

export interface WorktreeStatus {
    readonly root: Directory;
    readonly branch: Text;
    readonly ahead: Count | null;
    readonly tracked: Count;
    readonly untracked: Count | null;
    readonly at: Instant;
}

export interface WorktreeWatch {
    readonly root: Directory;
    readonly gitDir: Directory;
    readonly commonDir: Directory;
}

export function parseWorktreeWatch(input: unknown): Result<WorktreeWatch, ParseFailure> {
    const raw = parseText(input);
    if (raw.kind === 'err') {
        return raw;
    }
    const [top, gitDir, commonDir] = raw.value.split('\n').map((line) => line.trim());
    const root = parseDirectory(top);
    if (root.kind === 'err') {
        return root;
    }
    const git = parseDirectory(gitDir);
    if (git.kind === 'err') {
        return git;
    }
    const common = parseDirectory(commonDir);
    if (common.kind === 'err') {
        return common;
    }
    return ok({ root: root.value, gitDir: git.value, commonDir: common.value });
}

export type WorktreeSwitch = 'on' | 'off';

export function parseWorktreeSwitch(input: unknown): Result<WorktreeSwitch, ParseFailure> {
    return ok(typeof input === 'string' && input.trim().toLowerCase() === 'off' ? 'off' : 'on');
}

export function tierOf(trigger: StatusTrigger): StatusTier {
    return trigger === 'git-dir' ? 'tracked' : 'full';
}

export function foldReading(previous: WorktreeStatus | null, root: Directory, tier: StatusTier, reading: PorcelainReading, at: Instant): WorktreeStatus {
    const untracked = tier === 'full' ? reading.untracked : (previous?.untracked ?? null);
    return { root, branch: reading.branch, ahead: reading.ahead, tracked: reading.tracked, untracked, at };
}

export function changedOf(status: WorktreeStatus): Count {
    const total = parseCount(status.tracked + (status.untracked ?? 0));
    return total.kind === 'ok' ? total.value : status.tracked;
}

export function refreshDue(since: Instant, now: Instant, every: Duration): StatusTier | null {
    return now - since >= every ? 'full' : null;
}

export interface RootRun {
    readonly running: boolean;
    readonly wanted: StatusTier | null;
}

export interface RunStep {
    readonly state: RootRun;
    readonly start: StatusTier | null;
}

export const IDLE_ROOT: RootRun = { running: false, wanted: null };

export function strongest(wanted: StatusTier | null, tier: StatusTier): StatusTier {
    return wanted === 'full' || tier === 'full' ? 'full' : 'tracked';
}

export function wantRun(state: RootRun, tier: StatusTier): RootRun {
    return { running: state.running, wanted: strongest(state.wanted, tier) };
}

export function takeRun(state: RootRun): RunStep {
    if (state.running || state.wanted === null) {
        return { state, start: null };
    }
    return { state: { running: true, wanted: null }, start: state.wanted };
}

export function runDone(state: RootRun): RootRun {
    return { running: false, wanted: state.wanted };
}

export interface LaneGlance {
    readonly cwd: Directory | null;
    readonly status: LaneStatus;
}

export interface PaneAttach {
    readonly pane: PaneId;
    readonly cwd: Directory | null;
}

export interface WorktreeMoves {
    readonly known: ReadonlyMap<PaneId, LaneGlance>;
    readonly attach: readonly PaneAttach[];
    readonly detach: readonly PaneId[];
    readonly ended: readonly PaneId[];
}

export function movesOf(known: ReadonlyMap<PaneId, LaneGlance>, lanes: ReadonlyMap<PaneId, Lane>): WorktreeMoves {
    const attach: PaneAttach[] = [];
    const ended: PaneId[] = [];
    const next = new Map<PaneId, LaneGlance>();
    for (const [pane, lane] of lanes) {
        const before = known.get(pane);
        next.set(pane, { cwd: lane.cwd, status: lane.status });
        if (before === undefined || before.cwd !== lane.cwd) {
            attach.push({ pane, cwd: lane.cwd });
        }
        if (before !== undefined && endsTurn(before.status, lane.status)) {
            ended.push(pane);
        }
    }
    const detach = [...known.keys()].filter((pane) => !lanes.has(pane));
    return { known: next, attach, detach, ended };
}
