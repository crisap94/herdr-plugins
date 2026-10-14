import type { Store } from '#src/adapters/db/database.ts';
import { FsGitDirWatcher } from '#src/adapters/git-dir-watch.ts';
import { GitWorktreeLocator, GitWorktreeProbe } from '#src/adapters/git-worktree-status.ts';
import { NodeProcessUsage } from '#src/adapters/process-usage.ts';
import { SystemClock } from '#src/adapters/system-clock.ts';
import { PaneNoteFeed } from '#src/recap/application/pane-note-feed.ts';
import { PerfLedger } from '#src/recap/application/perf-ledger.ts';
import { WorktreeRegistry } from '#src/recap/application/worktree-registry.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { duration } from '#src/recap/domain/time.ts';
import { WORKTREE_SAFETY_MS, WORKTREE_SETTLE_MS } from './timing.ts';
import { worktreeSwitch } from './worktree-switch.ts';

export interface Worktrees {
    readonly registry: WorktreeRegistry;
    readonly feed: PaneNoteFeed;
    readonly perf: PerfLedger;
}

export function wireWorktrees(store: Store, log: (line: Text) => void): Worktrees {
    const clock = new SystemClock();
    const perf = new PerfLedger({ usage: new NodeProcessUsage(), clock, log });
    const feed = new PaneNoteFeed(store.paneNotes);
    const registry = new WorktreeRegistry({
        locator: new GitWorktreeLocator(),
        probe: new GitWorktreeProbe(),
        watcher: new FsGitDirWatcher(),
        store: store.worktrees,
        clock,
        perf,
        enabled: worktreeSwitch,
        gone: (pane): void => { feed.forget(pane); },
        settle: duration(WORKTREE_SETTLE_MS),
        every: duration(WORKTREE_SAFETY_MS),
    });
    return { registry, feed, perf };
}
