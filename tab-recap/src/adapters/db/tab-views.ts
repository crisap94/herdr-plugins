import type { Database } from 'bun:sqlite';
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import { err, must, ok, type Result } from '#src/protocol/result.ts';
import type { RestoredLane } from '#src/recap/domain/closures.ts';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import { parseAgentKind, parsePaneId, parseTabId, type PaneId, type TabId } from '#src/recap/domain/ids.ts';
import type { ParseFailure } from '#src/recap/domain/parse-failure.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { parseInstant } from '#src/recap/domain/time.ts';
import { failureCauseOf, parseThrown } from '#src/recap/domain/failure-cause.ts';
import { parseTabViewRecord, type LiveLanes, type LiveLanesRead, type TabViewRecord, type TabViewStore } from '#src/ports/tab-views.ts';
import { unreadableOf } from '#src/ports/unknowable.ts';
import { writeTx } from './connection.ts';
import { BadRow, guarded, isRow, one, text } from './rows.ts';
import { lane as laneTable, tab as tabTable } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import { TabStore } from './tab-row.ts';

type RestoredRow = RestoredLane;
type Lane = TabViewRecord['lanes'][number];

const columnOf = <T, K extends keyof T>(source: T | null | undefined, key: K): T[K] | null => source?.[key] ?? null;

export function parseRestoredRow(input: unknown): Result<RestoredRow, ParseFailure> {
    if (!isRow(input)) {
        return err({ kind: 'not-a-row' });
    }
    const tab = parseTabId(input.tab_id);
    if (tab.kind === 'err') {
        return tab;
    }
    const pane = parsePaneId(input.pane);
    if (pane.kind === 'err') {
        return pane;
    }
    const agent = parseAgentKind(input.agent);
    if (agent.kind === 'err') {
        return agent;
    }
    const since = input.since === null ? ok(null) : parseInstant(input.since);
    if (since.kind === 'err') {
        return since;
    }
    const cwd = input.cwd === null ? ok(null) : parseDirectory(input.cwd);
    if (cwd.kind === 'err') {
        return cwd;
    }
    return ok({ tab: tab.value, pane: pane.value, agent: agent.value, since: since.value, cwd: cwd.value });
}

function restoredOrThrow(result: Result<RestoredRow, ParseFailure>): RestoredRow {
    if (result.kind === 'err') {
        throw new BadRow(`restored lane is ${result.error.kind}`);
    }
    return result.value;
}

const LANE_VIEW = {
    pane: laneTable.pane, agent: laneTable.agent, status: laneTable.status, title: laneTable.title, cwd: laneTable.cwd, last_prompt: laneTable.lastPrompt,
    web_base: laneTable.webBase, web_forge: laneTable.webForge, web_branch: laneTable.webBranch,
    context_tokens: laneTable.contextTokens, context_window: laneTable.contextWindow, context_source: laneTable.contextSource,
};

const LIVE_VIEW = { tab_id: laneTable.tabId, pane: laneTable.pane, agent: laneTable.agent, since: laneTable.since, cwd: laneTable.cwd };

export class TabViewRowStore implements TabViewStore, LiveLanes {
    private readonly db: Database;
    private readonly orm: Orm;
    private readonly daemonVersion: Text | null;
    private readonly tabs: TabStore;
    private readonly hasSince: boolean;

    constructor(db: Database, daemonVersion: Text | null = null) {
        this.db = db;
        this.orm = ormOf(db);
        this.daemonVersion = daemonVersion;
        this.tabs = new TabStore(db);
        this.hasSince = one(db.prepare("SELECT 1 AS present FROM pragma_table_info('lane') WHERE name = 'since'")) !== null;
    }

    tabOf(pane: PaneId): TabId | null {
        return guarded(() => {
            const row = this.orm.select({ tab_id: laneTable.tabId }).from(laneTable).where(eq(laneTable.pane, pane)).limit(1).get();
            return row === undefined ? null : must(parseTabId(text(row, 'tab_id')));
        }, null);
    }

    readTab(tab: TabId): TabViewRecord | null {
        return guarded((): TabViewRecord | null => {
            const row = this.orm.select({ column_pane: tabTable.columnPane, view_at: tabTable.viewAt, daemon_version: tabTable.daemonVersion }).from(tabTable)
                .where(and(eq(tabTable.id, tab), isNotNull(tabTable.viewAt))).get();
            if (row === undefined) {
                return null;
            }
            const lanes = this.orm.select(LANE_VIEW).from(laneTable).where(eq(laneTable.tabId, tab)).orderBy(asc(laneTable.position)).all().map((lane) => ({
                pane: lane.pane, agent: lane.agent, status: lane.status, title: lane.title, cwd: lane.cwd, lastPrompt: lane.last_prompt,
                web: lane.web_base === null ? null : { base: lane.web_base, forge: lane.web_forge, branch: lane.web_branch },
                context: lane.context_tokens === null ? null : { tokens: lane.context_tokens, window: lane.context_window, source: lane.context_source },
            }));
            return must(parseTabViewRecord({ tab, column: row.column_pane, lanes, at: row.view_at, daemonVersion: row.daemon_version }));
        }, null);
    }

    liveLanes(): LiveLanesRead {
        if (!this.hasSince) {
            return { kind: 'read', lanes: [] };
        }
        try {
            return { kind: 'read', lanes: this.orm.select(LIVE_VIEW).from(laneTable).orderBy(asc(laneTable.tabId), asc(laneTable.position)).all().map((row) => restoredOrThrow(parseRestoredRow(row))) };
        } catch (error) {
            return unreadableOf(failureCauseOf(parseThrown(error)));
        }
    }

    writeTab(view: TabViewRecord): void {
        writeTx(this.db, () => {
            this.tabs.ensure(view.tab, view.at);
            this.orm.update(tabTable).set({ columnPane: view.column, viewAt: view.at, daemonVersion: view.daemonVersion ?? this.daemonVersion }).where(eq(tabTable.id, view.tab)).run();
            this.orm.delete(laneTable).where(eq(laneTable.tabId, view.tab)).run();
            this.insertLanes(view.tab, view.lanes);
        });
    }

    private insertLanes(tab: TabId, lanes: readonly Lane[]): void {
        lanes.forEach((lane, position) => {
            const webBase = columnOf(lane.web, 'base');
            const webForge = columnOf(lane.web, 'forge');
            const webBranch = columnOf(lane.web, 'branch');
            const contextTokens = columnOf(lane.context, 'tokens');
            const contextWindow = columnOf(lane.context, 'window');
            const contextSource = columnOf(lane.context, 'source');
            if (!this.hasSince) {
                this.orm.run(sql`INSERT INTO lane (tab_id, pane, position, agent, status, title, cwd, last_prompt, web_base, web_forge, web_branch, context_tokens, context_window, context_source) VALUES (${tab}, ${lane.pane}, ${position}, ${lane.agent}, ${lane.status}, ${lane.title}, ${lane.cwd}, ${lane.lastPrompt ?? null}, ${webBase}, ${webForge}, ${webBranch}, ${contextTokens}, ${contextWindow}, ${contextSource})`);
                return;
            }
            this.orm.insert(laneTable).values({
                tabId: tab, pane: lane.pane, position, agent: lane.agent, status: lane.status, title: lane.title, cwd: lane.cwd, lastPrompt: lane.lastPrompt ?? null,
                webBase, webForge, webBranch, contextTokens, contextWindow, contextSource, since: lane.since ?? null,
            }).run();
        });
    }
}
