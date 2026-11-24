import { statSync } from 'node:fs';
import { join } from 'node:path';
import { notesByPaneOf, warningTextsOf } from '#src/extensions/load.ts';
import { storedNotes } from '#src/extensions/stored-notes.ts';
import type { ExtensionPort, PaneNote } from '#src/ports/extension.ts';
import type { TabViewRecord } from '#src/ports/tab-views.ts';
import { loadSettings } from '#src/daemon/config.ts';
import { worktreeSwitch } from '#src/daemon/worktree-switch.ts';
import { must } from '@stateforge-labs/session-ledger';
import { EditCache, EditTally } from '#src/recap/application/edit-tally.ts';
import { ExpandedModel, type ExpandedData, type ExpandedDeps } from '#src/recap/application/expanded-view.ts';
import type { GuiReads } from '#src/recap/application/gui-tab-reads.ts';
import { parseCount, type Count } from '@stateforge-labs/session-ledger';
import type { Directory } from '@stateforge-labs/session-ledger';
import { NO, YES, type Flag, type GuiLocale } from '#src/recap/domain/gui-tab-parts.ts';
import type { SessionKey, ScopeId } from '#src/recap/domain/ids.ts';
import { parseText } from '@stateforge-labs/session-ledger';
import type { Instant } from '@stateforge-labs/session-ledger';
import type { WorktreeStatus } from '#src/recap/domain/worktree.ts';
import { codeVersion } from '../os/plugin-version.ts';
import { modalTranscriptRegistry } from '../transcripts/registry.ts';
import { EXPANDED_EVERY_MS, OPEN_MARKER_FRESH_MS, OPEN_MARKER_PREFIX, SETTLE_MS, TRAILING_SLACK_MS } from './constants.ts';
import type { Store } from '../db/database.ts';
import type { OpenLeases } from './lease.ts';

export type DesktopMode = 'daemon' | 'read-only';

export interface DesktopReadsDeps {
    readonly store: Store;
    readonly dir: Directory;
    readonly republish: (tab: ScopeId) => void;
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
    readonly extensions: readonly ExtensionPort[];
}

const nobody = (): ReturnType<ExpandedDeps['edits']> => [];

const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

export class DesktopReads {
    private readonly deps: DesktopReadsDeps;
    private readonly watching: ExpandedModel;
    private readonly quiet: ExpandedModel;
    private readonly held = new Map<ScopeId, Held>();
    private readonly timers = new Map<ScopeId, NodeJS.Timeout>();
    private settled: Settled | null = null;

    constructor(deps: DesktopReadsDeps) {
        this.deps = deps;
        const edits = new EditCache(new EditTally(modalTranscriptRegistry()));
        const base: Omit<ExpandedDeps, 'requests'> = {
            records: deps.store.records, ledger: deps.store.ledger, stories: deps.store.stories, session: deps.store.session, autocompact: deps.store.decisions, boundaries: deps.store.boundaries,
            edits: deps.mode === 'daemon' ? edits.of.bind(edits) : nobody,
        };
        this.watching = new ExpandedModel({ ...base, requests: deps.store.requests });
        this.quiet = new ExpandedModel({ ...base, requests: { requestCurate: (): void => undefined } });
    }

    read(tab: ScopeId, view: TabViewRecord | null): GuiReads {
        const now = this.deps.now();
        const settled = this.settledAt(now);
        const lanes = view?.lanes;
        const git = (pane: SessionKey): WorktreeStatus | null => (worktreeSwitch() === 'on' ? this.deps.store.worktrees.statusOf(pane) : null);
        const found = notesByPaneOf(settled.extensions, lanes, settled.locale);
        return {
            expanded: this.expandedFor(tab, view, now), notes: (pane): readonly PaneNote[] => found.get(pane) ?? [],
            warnings: warningTextsOf(settled.extensions, settled.locale), compactions: this.deps.store.compactions.shownFor(tab),
            compactHint: settled.hint, locale: settled.locale, zone: must(parseText(ZONE)), plugin: this.pluginVersion(), git,
        };
    }

    private pluginVersion(): GuiReads['plugin'] {
        const found = codeVersion();
        return found;
    }

    private settledAt(now: Instant): Settled {
        if (this.settled !== null && now - this.settled.at < SETTLE_MS) { return this.settled; }
        const config = loadSettings();
        const hint = config.compaction.hint === null ? null : must(parseCount(config.compaction.hint));
        const store = this.deps.store;
        const own = storedNotes({ statuses: store.worktrees, notes: store.paneNotes, alerts: store.paneAlerts, gitNote: worktreeSwitch });
        this.settled = { at: now, locale: config.locale, hint, extensions: [own] };
        return this.settled;
    }

    forget(tab: ScopeId): void {
        this.held.delete(tab);
    }

    watched(tab: ScopeId, now: Instant): Flag {
        if (this.deps.mode !== 'daemon') { return NO; }
        if (this.deps.leases?.held(tab, now) === YES) { return YES; }
        try {
            return now - statSync(join(this.deps.dir, `${OPEN_MARKER_PREFIX}${encodeURIComponent(tab)}`)).mtimeMs < OPEN_MARKER_FRESH_MS ? YES : NO;
        } catch {
            return NO;
        }
    }

    private expandedFor(tab: ScopeId, view: TabViewRecord | null, now: Instant): ExpandedData {
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

    private later(tab: ScopeId, wait: Count): void {
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
