import { statSync } from 'node:fs';
import { join } from 'node:path';
import { loadExtensions, notesOf, warningsOf } from '#src/extensions/load.ts';
import { storedNotes } from '#src/extensions/stored-notes.ts';
import type { Extension, Note } from '#src/ports/extension.ts';
import type { TabView } from '#src/ports/tab-views.ts';
import { configGetter, loadConfig } from '#src/daemon/config.ts';
import { worktreeSwitch } from '#src/daemon/worktree-switch.ts';
import { must } from '#src/protocol/result.ts';
import { EditCache, EditCounts } from '#src/recap/application/edit-counts.ts';
import type { FileCount } from '#src/recap/application/edit-counts.ts';
import { ExpandedModel, type ExpandedData, type ExpandedDeps } from '#src/recap/application/expanded-view.ts';
import type { GuiReads } from '#src/recap/application/gui-tab-reads.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import type { Directory } from '#src/recap/domain/directory.ts';
import { NO, YES, type Flag, type GuiLocale } from '#src/recap/domain/gui-tab-parts.ts';
import type { PaneId, TabId } from '#src/recap/domain/ids.ts';
import { parseText } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import type { WorktreeStatus } from '#src/recap/domain/worktree.ts';
import { codeVersion } from './os/plugin-version.ts';
import { modalTranscriptRegistry } from './transcript-registry.ts';
import { EXPANDED_EVERY_MS, OPEN_MARKER_FRESH_MS, OPEN_MARKER_PREFIX, SETTLE_MS, TRAILING_SLACK_MS } from './desktop-constants.ts';
import type { Store } from './db/database.ts';
import type { OpenLeases } from './desktop-lease.ts';

export type DesktopMode = 'daemon' | 'read-only';

export interface DesktopReadsDeps {
    readonly store: Store;
    readonly dir: Directory;
    readonly republish: (tab: TabId) => void;
    readonly mode: DesktopMode;
    readonly now: () => Instant;
    readonly leases?: OpenLeases;
}

interface Held {
    readonly data: ExpandedData;
    readonly at: Instant;
    readonly watched: Flag;
}

interface Settled {
    readonly at: Instant;
    readonly locale: GuiLocale;
    readonly hint: Count | null;
    readonly extensions: readonly Extension[];
}

const nobody = (): readonly FileCount[] => [];

const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

export class DesktopReads {
    private readonly deps: DesktopReadsDeps;
    private readonly watching: ExpandedModel;
    private readonly quiet: ExpandedModel;
    private readonly held = new Map<TabId, Held>();
    private readonly timers = new Map<TabId, NodeJS.Timeout>();
    private settled: Settled | null = null;

    constructor(deps: DesktopReadsDeps) {
        this.deps = deps;
        const edits = new EditCache(new EditCounts(modalTranscriptRegistry()));
        const base: Omit<ExpandedDeps, 'requests'> = {
            records: deps.store.records, ledger: deps.store.ledger, stories: deps.store.stories, session: deps.store.session, autocompact: deps.store.autocompact, boundaries: deps.store.boundaries,
            edits: deps.mode === 'daemon' ? edits.of.bind(edits) : nobody,
        };
        this.watching = new ExpandedModel({ ...base, requests: deps.store.requests });
        this.quiet = new ExpandedModel({ ...base, requests: { requestCurate: (): void => undefined } });
    }

    read(tab: TabId, view: TabView | null): GuiReads {
        const now = this.deps.now();
        const settled = this.settledAt(now);
        const lanes = view?.lanes;
        const git = (pane: PaneId): WorktreeStatus | null => (worktreeSwitch() === 'on' ? this.deps.store.worktrees.statusOf(pane) : null);
        const found = notesOf(settled.extensions, lanes, settled.locale);
        return {
            expanded: this.expandedFor(tab, view, now), notes: (pane): readonly Note[] => found.get(pane) ?? [],
            warnings: warningsOf(settled.extensions, settled.locale).map(parseText).map(must), compactions: this.deps.store.compactions.shownFor(tab),
            compactHint: settled.hint, locale: settled.locale, zone: must(parseText(ZONE)), plugin: this.pluginVersion(), git,
        };
    }

    private pluginVersion(): GuiReads['plugin'] {
        const found = codeVersion();
        return found === null ? null : must(parseText(found));
    }

    private settledAt(now: Instant): Settled {
        if (this.settled !== null && now - this.settled.at < SETTLE_MS) { return this.settled; }
        const config = loadConfig();
        const hint = config.compaction.hint === null ? null : must(parseCount(config.compaction.hint));
        const store = this.deps.store;
        const own = storedNotes({ statuses: store.worktrees, notes: store.paneNotes, alerts: store.paneAlerts, gitNote: worktreeSwitch });
        this.settled = { at: now, locale: config.locale, hint, extensions: [...loadExtensions(configGetter()), own] };
        return this.settled;
    }

    forget(tab: TabId): void {
        this.held.delete(tab);
    }

    watched(tab: TabId, now: Instant): Flag {
        if (this.deps.mode !== 'daemon') { return NO; }
        if (this.deps.leases?.held(tab, now) === YES) { return YES; }
        try {
            return now - statSync(join(this.deps.dir, `${OPEN_MARKER_PREFIX}${encodeURIComponent(tab)}`)).mtimeMs < OPEN_MARKER_FRESH_MS ? YES : NO;
        } catch {
            return NO;
        }
    }

    private expandedFor(tab: TabId, view: TabView | null, now: Instant): ExpandedData {
        const watched = this.watched(tab, now);
        const held = this.held.get(tab);
        if (held !== undefined && held.watched === watched && now - held.at < EXPANDED_EVERY_MS) {
            this.later(tab, must(parseCount(held.at + EXPANDED_EVERY_MS - now + TRAILING_SLACK_MS)));
            return held.data;
        }
        const read = (watched === YES ? this.watching : this.quiet).read(tab, view, now);
        const data: ExpandedData = watched === YES ? read : { ...read, tasks: read.tasks.map((task) => Object.assign({}, task, { curating: false })) };
        this.held.set(tab, { data, at: now, watched });
        return data;
    }

    private later(tab: TabId, wait: Count): void {
        if (this.deps.mode !== 'daemon') { return; }
        const pending = this.timers.get(tab);
        if (pending !== undefined) { clearTimeout(pending); }
        const timer = setTimeout(() => {
            this.timers.delete(tab);
            this.deps.republish(tab);
        }, wait);
        timer.unref();
        this.timers.set(tab, timer);
    }
}
