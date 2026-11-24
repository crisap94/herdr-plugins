import type { Store } from '#src/adapters/db/database.ts';
import type { FleetPaneTokens } from '#src/ports/fleet-source.ts';
import { parseWireText, type WireText } from '#src/protocol/primitives.ts';
import type { CompactRequestQueue } from '#src/recap/application/compact-requests.ts';
import { notesOf } from '#src/recap/domain/coordination.ts';
import type { SessionKey } from '#src/recap/domain/ids.ts';
import type { HandoffExchangeWiring } from './handoff-exchange-wiring.ts';
import { FsGitDirWatcher } from '#src/adapters/git/dir-watch.ts';
import { GitWorktreeLocator, GitWorktreeProbe } from '#src/adapters/git/worktree-status.ts';
import { NodeProcessUsage } from '#src/adapters/os/process/usage.ts';
import { SystemClock } from '#src/adapters/os/system-clock.ts';
import { PaneNoteFeed } from '#src/recap/application/pane-note-feed.ts';
import { PerfLedger } from '#src/recap/application/perf-ledger.ts';
import { WorktreeRegistry } from '#src/recap/application/worktree-registry.ts';
import { textOf, type Text } from '#src/recap/domain/text.ts';
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
        gone: (pane): void => { feed.forget(pane); store.paneAlerts.forgetPane(pane); },
        settle: duration(WORKTREE_SETTLE_MS),
        every: duration(WORKTREE_SAFETY_MS),
    });
    return { registry, feed, perf };
}

const wireMap = (tokens: FleetPaneTokens): ReadonlyMap<WireText, WireText> => {
    const wire = new Map<WireText, WireText>();
    for (const [name, raw] of tokens) {
        const key = parseWireText(name);
        const value = parseWireText(raw);
        if (key.kind === 'ok' && value.kind === 'ok') {
            wire.set(key.value, value.value);
        }
    }
    return wire;
};

export function routePaneTokens(worktrees: Worktrees, answers: CompactRequestQueue, exchange: HandoffExchangeWiring): (pane: SessionKey, tokens: FleetPaneTokens) => void {
    return (pane, tokens) => {
        const text = new Map([...tokens].map(([name, raw]): [Text, Text] => [textOf(name), textOf(raw)]));
        worktrees.feed.update(pane, notesOf(text));
        answers.onPaneTokens(pane, wireMap(tokens));
        exchange.responder.onPaneTokens(pane, text);
    };
}
