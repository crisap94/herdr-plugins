// The TabViews repository: a tab's row (where its column is, when it was published) and its lanes, replaced on each write.
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { LaneWeb, TabLane, TabView, TabViews } from '#src/ports/tab-views.ts';
import { writeTx } from './connection.ts';
import { all, guarded, maybeText, one, text, whole } from './rows.ts';
import type { Row } from './rows.ts';
import { TabRow } from './tab-row.ts';

function webOf(row: Row): LaneWeb | null {
    const base = maybeText(row, 'web_base');
    const forge = maybeText(row, 'web_forge');
    return base === null || (forge !== 'gitlab' && forge !== 'github') ? null : { base, forge, branch: maybeText(row, 'web_branch') };
}

const laneOf = (row: Row): TabLane => ({
    pane: text(row, 'pane'), agent: text(row, 'agent'), status: text(row, 'status'), title: maybeText(row, 'title'), cwd: maybeText(row, 'cwd'), lastPrompt: maybeText(row, 'last_prompt'), web: webOf(row),
});

export class TabViewsRepository implements TabViews {
    private readonly db: DatabaseSync;
    private readonly daemonVersion: string | null;
    private readonly tabs: TabRow;
    private readonly view: StatementSync;
    private readonly lanes: StatementSync;
    private readonly update: StatementSync;
    private readonly clear: StatementSync;
    private readonly insert: StatementSync;

    /** `daemonVersion` is only given by the daemon: every view it writes says which version it is running. */
    constructor(db: DatabaseSync, daemonVersion: string | null = null) {
        this.db = db;
        this.daemonVersion = daemonVersion;
        this.tabs = new TabRow(db);
        this.view = db.prepare('SELECT column_pane, view_at, daemon_version FROM tab WHERE id = ? AND view_at IS NOT NULL');
        this.lanes = db.prepare('SELECT pane, agent, status, title, cwd, last_prompt, web_base, web_forge, web_branch FROM lane WHERE tab_id = ? ORDER BY position');
        this.update = db.prepare('UPDATE tab SET column_pane = ?, view_at = ?, daemon_version = ? WHERE id = ?');
        this.clear = db.prepare('DELETE FROM lane WHERE tab_id = ?');
        this.insert = db.prepare('INSERT INTO lane (tab_id, pane, position, agent, status, title, cwd, last_prompt, web_base, web_forge, web_branch) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    }

    readTab(tab: string): TabView | null {
        return guarded(() => {
            const row = one(this.view, tab);
            return row === null ? null : { tab, column: maybeText(row, 'column_pane'), lanes: all(this.lanes, tab).map(laneOf), at: whole(row, 'view_at'), daemonVersion: maybeText(row, 'daemon_version') };
        }, null);
    }

    writeTab(view: TabView): void {
        writeTx(this.db, () => {
            this.tabs.ensure(view.tab, view.at);
            this.update.run(view.column, view.at, view.daemonVersion ?? this.daemonVersion, view.tab);
            this.clear.run(view.tab);
            view.lanes.forEach((lane, position) => {
                this.insert.run(view.tab, lane.pane, position, lane.agent, lane.status, lane.title, lane.cwd, lane.lastPrompt ?? null, lane.web?.base ?? null, lane.web?.forge ?? null, lane.web?.branch ?? null);
            });
        });
    }
}
