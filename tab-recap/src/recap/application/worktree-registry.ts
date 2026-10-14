import type { Clock } from '#src/ports/clock.ts';
import type { PerfSink } from '#src/ports/perf-sink.ts';
import { unknown } from '#src/ports/unknowable.ts';
import type { GitDirWatch, GitDirWatcher, StatusRead, WorktreeLocator, WorktreeProbe, WorktreeStatusWriter } from '#src/ports/worktree-status.ts';
import type { Board } from '#src/recap/domain/board.ts';
import type { Directory } from '#src/recap/domain/directory.ts';
import type { PaneId } from '#src/recap/domain/ids.ts';
import type { Duration, Instant } from '#src/recap/domain/time.ts';
import { isHidden } from '#src/recap/domain/visibility.ts';
import { foldReading, IDLE_ROOT, movesOf, refreshDue, runDone, takeRun, tierOf, wantRun } from '#src/recap/domain/worktree.ts';
import type { LaneGlance, RootRun, StatusTier, StatusTrigger, WorktreeStatus, WorktreeSwitch, WorktreeWatch } from '#src/recap/domain/worktree.ts';

export interface WorktreeRegistryDeps {
    readonly locator: WorktreeLocator;
    readonly probe: WorktreeProbe;
    readonly watcher: GitDirWatcher;
    readonly store: WorktreeStatusWriter;
    readonly clock: Clock;
    readonly perf: PerfSink;
    readonly enabled: () => WorktreeSwitch;
    readonly gone: (pane: PaneId) => void;
    readonly settle: Duration;
    readonly every: Duration;
}

interface Open {
    readonly watch: GitDirWatch;
    run: RootRun;
    status: WorktreeStatus | null;
    fullAt: Instant;
}

const THREW: StatusRead = unknown({ why: 'unreadable', detail: 'the status read threw' });

export class WorktreeRegistry {
    private readonly deps: WorktreeRegistryDeps;
    private readonly roots = new Map<Directory, Open>();
    private readonly panes = new Map<PaneId, Directory>();
    private readonly resolving = new Map<PaneId, Directory | null>();
    private readonly located = new Map<Directory, WorktreeWatch>();
    private readonly scheduled = new Map<Directory, () => void>();
    private known: ReadonlyMap<PaneId, LaneGlance> = new Map();
    private state: WorktreeSwitch;

    constructor(deps: WorktreeRegistryDeps) {
        this.deps = deps;
        this.state = deps.enabled();
        deps.store.reset();
    }

    beat(board: Board): void {
        if (this.state === 'off') {
            return;
        }
        const moves = movesOf(this.known, board.lanes);
        this.known = moves.known;
        moves.detach.forEach((pane) => { this.detach(pane); });
        moves.attach.forEach((one) => { void this.attach(one.pane, one.cwd); });
        moves.ended.forEach((pane) => { this.turnEnded(pane); });
    }

    tick(board: Board): void {
        this.state = this.deps.enabled();
        if (this.state === 'off') {
            this.release();
            return;
        }
        this.beat(board);
        const now = this.deps.clock.now();
        const shown = this.shownRoots(board);
        for (const [root, open] of this.roots) {
            if (refreshDue(open.fullAt, now, this.deps.every) !== null && shown.has(root)) {
                this.request(root, 'safety');
            }
        }
    }

    release(): void {
        [...this.panes.keys()].forEach((pane) => { this.unbind(pane); });
        this.resolving.clear();
        this.known = new Map();
    }

    private shownRoots(board: Board): ReadonlySet<Directory> {
        const shown = new Set<Directory>();
        for (const [pane, root] of this.panes) {
            const lane = board.lanes.get(pane);
            if (lane !== undefined && !isHidden(board, lane.tab)) {
                shown.add(root);
            }
        }
        return shown;
    }

    private turnEnded(pane: PaneId): void {
        const root = this.panes.get(pane);
        if (root !== undefined) {
            this.request(root, 'turn-ended');
        }
    }

    private detach(pane: PaneId): void {
        this.resolving.delete(pane);
        this.unbind(pane);
        this.deps.gone(pane);
    }

    private async attach(pane: PaneId, cwd: Directory | null): Promise<void> {
        this.unbind(pane);
        this.resolving.set(pane, cwd);
        const worktree = cwd === null ? null : await this.worktreeOf(cwd);
        if (this.resolving.get(pane) !== cwd || worktree === null) {
            return;
        }
        this.resolving.delete(pane);
        this.join(pane, worktree);
    }

    private async worktreeOf(cwd: Directory): Promise<WorktreeWatch | null> {
        const cached = this.located.get(cwd);
        if (cached !== undefined) {
            return cached;
        }
        this.deps.perf.bump('locate');
        const lookup = await this.deps.locator.locate(cwd);
        if (lookup.kind === 'worktree') {
            this.located.set(cwd, lookup.worktree);
            return lookup.worktree;
        }
        if (lookup.kind === 'unknown') {
            this.deps.perf.bump('failed');
        }
        return null;
    }

    private join(pane: PaneId, worktree: WorktreeWatch): void {
        this.panes.set(pane, worktree.root);
        this.deps.store.bind(pane, worktree.root);
        if (!this.roots.has(worktree.root)) {
            this.open(worktree);
            this.request(worktree.root, 'attached');
        }
    }

    private open(worktree: WorktreeWatch): void {
        const root = worktree.root;
        const watch = this.deps.watcher.watch(worktree, () => {
            this.deps.perf.bump('git-dir-event');
            this.request(root, 'git-dir');
        });
        this.roots.set(root, { watch, run: IDLE_ROOT, status: null, fullAt: this.deps.clock.now() });
    }

    private unbind(pane: PaneId): void {
        const root = this.panes.get(pane);
        if (root === undefined) {
            return;
        }
        this.panes.delete(pane);
        this.deps.store.bind(pane, null);
        if (![...this.panes.values()].includes(root)) {
            this.close(root);
        }
    }

    private close(root: Directory): void {
        this.roots.get(root)?.watch.close();
        this.scheduled.get(root)?.();
        this.scheduled.delete(root);
        this.roots.delete(root);
        this.located.forEach((worktree, cwd) => {
            if (worktree.root === root) {
                this.located.delete(cwd);
            }
        });
        this.deps.store.drop(root);
    }

    private request(root: Directory, trigger: StatusTrigger): void {
        const open = this.roots.get(root);
        if (open === undefined) {
            return;
        }
        const waiting = this.scheduled.has(root);
        if (waiting || open.run.running) {
            this.deps.perf.bump('status-coalesced');
        }
        open.run = wantRun(open.run, tierOf(trigger));
        if (!waiting) {
            const handle = setTimeout(() => {
                this.scheduled.delete(root);
                this.flush(root);
            }, this.deps.settle);
            handle.unref();
            this.scheduled.set(root, () => { clearTimeout(handle); });
        }
    }

    private flush(root: Directory): void {
        const open = this.roots.get(root);
        if (open === undefined) {
            return;
        }
        const step = takeRun(open.run);
        open.run = step.state;
        if (step.start !== null) {
            void this.execute(root, open, step.start);
        }
    }

    private async execute(root: Directory, open: Open, tier: StatusTier): Promise<void> {
        this.deps.perf.bump(tier === 'full' ? 'status-full' : 'status-tracked');
        const read = await this.deps.probe.read(root, tier).catch((): StatusRead => THREW);
        if (this.roots.get(root) !== open) {
            return;
        }
        if (read.kind === 'read') {
            const status = foldReading(open.status, root, tier, read.reading, this.deps.clock.now());
            open.status = status;
            open.fullAt = tier === 'full' ? status.at : open.fullAt;
            this.deps.store.write(status);
        } else {
            this.deps.perf.bump('failed');
        }
        open.run = runDone(open.run);
        this.flush(root);
    }
}
