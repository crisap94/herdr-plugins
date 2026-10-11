import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { ContextUse, WindowSource } from '#src/recap/domain/compaction.ts';
import type { RestoredLane } from '#src/recap/domain/closures.ts';
import { agentKind, paneId, tabId } from '#src/recap/domain/ids.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { LaneWeb, LiveLanes, LiveLanesRead, TabLane, TabView, TabViews } from '#src/ports/tab-views.ts';
import { writeTx } from './connection.ts';
import { all, guarded, maybeText, maybeWhole, one, text, whole } from './rows.ts';
import type { Row } from './rows.ts';
import { TabRow } from './tab-row.ts';

function webOf(row: Row): LaneWeb | null {
    const base = maybeText(row, 'web_base');
    const forge = maybeText(row, 'web_forge');
    return base === null || (forge !== 'gitlab' && forge !== 'github') ? null : { base, forge, branch: maybeText(row, 'web_branch') };
}

const webColumns = (web: LaneWeb | null | undefined): [string | null, string | null, string | null] => [web?.base ?? null, web?.forge ?? null, web?.branch ?? null];
const contextColumns = (use: ContextUse | null | undefined): [number | null, number | null, string | null] => [use?.tokens ?? null, use?.window ?? null, use?.source ?? null];

const SOURCES: readonly WindowSource[] = ['agent', 'catalogue', 'table', 'observed', 'setting'];

function contextOf(row: Row): ContextUse | null {
    const [tokens, window, source] = [maybeWhole(row, 'context_tokens'), maybeWhole(row, 'context_window'), maybeText(row, 'context_source')];
    const found = SOURCES.find((candidate) => candidate === source);
    return tokens === null || window === null || found === undefined ? null : { tokens, window, source: found };
}

const laneOf = (row: Row): TabLane => ({
    pane: text(row, 'pane'), agent: text(row, 'agent'), status: text(row, 'status'), title: maybeText(row, 'title'), cwd: maybeText(row, 'cwd'), lastPrompt: maybeText(row, 'last_prompt'), web: webOf(row), context: contextOf(row),
});

const sinceOf = (row: Row): Instant | null => {
    const value = maybeWhole(row, 'since');
    return value === null ? null : instant(value);
};

const restoredOf = (row: Row): RestoredLane => ({
    tab: tabId(text(row, 'tab_id')), pane: paneId(text(row, 'pane')), agent: agentKind(text(row, 'agent')), since: sinceOf(row), cwd: maybeText(row, 'cwd'),
});

const LANE_COLUMNS = 'tab_id, pane, position, agent, status, title, cwd, last_prompt, web_base, web_forge, web_branch, context_tokens, context_window, context_source';

export class TabViewsRepository implements TabViews, LiveLanes {
    private readonly db: DatabaseSync;
    private readonly daemonVersion: string | null;
    private readonly tabs: TabRow;
    private readonly view: StatementSync;
    private readonly lanes: StatementSync;
    private readonly update: StatementSync;
    private readonly clear: StatementSync;
    private readonly insert: StatementSync;
    private readonly insertSince: StatementSync | null;
    private readonly live: StatementSync | null;
    private readonly paneTab: StatementSync;

    constructor(db: DatabaseSync, daemonVersion: string | null = null) {
        this.db = db;
        this.daemonVersion = daemonVersion;
        this.tabs = new TabRow(db);
        this.view = db.prepare('SELECT column_pane, view_at, daemon_version FROM tab WHERE id = ? AND view_at IS NOT NULL');
        this.lanes = db.prepare('SELECT pane, agent, status, title, cwd, last_prompt, web_base, web_forge, web_branch, context_tokens, context_window, context_source FROM lane WHERE tab_id = ? ORDER BY position');
        this.update = db.prepare('UPDATE tab SET column_pane = ?, view_at = ?, daemon_version = ? WHERE id = ?');
        this.clear = db.prepare('DELETE FROM lane WHERE tab_id = ?');
        this.paneTab = db.prepare('SELECT tab_id FROM lane WHERE pane = ? LIMIT 1');
        this.insert = db.prepare(`INSERT INTO lane (${LANE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        const hasSince = one(db.prepare("SELECT 1 AS present FROM pragma_table_info('lane') WHERE name = 'since'")) !== null;
        this.insertSince = hasSince ? db.prepare(`INSERT INTO lane (${LANE_COLUMNS}, since) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`) : null;
        this.live = hasSince ? db.prepare('SELECT tab_id, pane, agent, since, cwd FROM lane ORDER BY tab_id, position') : null;
    }

    tabOf(pane: string): string | null {
        return guarded(() => {
            const row = one(this.paneTab, pane);
            return row === null ? null : text(row, 'tab_id');
        }, null);
    }

    readTab(tab: string): TabView | null {
        return guarded(() => {
            const row = one(this.view, tab);
            return row === null ? null : { tab, column: maybeText(row, 'column_pane'), lanes: all(this.lanes, tab).map(laneOf), at: whole(row, 'view_at'), daemonVersion: maybeText(row, 'daemon_version') };
        }, null);
    }

    liveLanes(): LiveLanesRead {
        if (this.live === null) {
            return { kind: 'read', lanes: [] };
        }
        try {
            return { kind: 'read', lanes: all(this.live).map(restoredOf) };
        } catch (error) {
            return { kind: 'unknown', why: { why: 'unreadable', detail: String(error) } };
        }
    }

    writeTab(view: TabView): void {
        writeTx(this.db, () => {
            this.tabs.ensure(view.tab, view.at);
            this.update.run(view.column, view.at, view.daemonVersion ?? this.daemonVersion, view.tab);
            this.clear.run(view.tab);
            view.lanes.forEach((lane, position) => {
                const row = [view.tab, lane.pane, position, lane.agent, lane.status, lane.title, lane.cwd, lane.lastPrompt ?? null, ...webColumns(lane.web), ...contextColumns(lane.context)];
                if (this.insertSince === null) {
                    this.insert.run(...row);
                } else {
                    this.insertSince.run(...row, lane.since ?? null);
                }
            });
        });
    }
}
