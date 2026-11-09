import type { Database } from 'bun:sqlite';
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import { err, ok, type Result } from '#src/protocol/result.ts';
import type { ContextUse, WindowSource } from '#src/recap/domain/compaction.ts';
import type { RestoredLane } from '#src/recap/domain/closures.ts';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import { paneId, parseAgentKind, parsePaneId, parseTabId, tabId } from '#src/recap/domain/ids.ts';
import type { ParseFailure } from '#src/recap/domain/parse-failure.ts';
import { parseInstant } from '#src/recap/domain/time.ts';
import type { LaneWeb, LiveLanes, LiveLanesRead, TabLane, TabView, TabViews } from '#src/ports/tab-views.ts';
import { unreadableOf } from '#src/ports/unknowable.ts';
import { failureCauseOf } from '#src/recap/domain/failure-cause.ts';
import { writeTx } from './connection.ts';
import { BadRow, guarded, isRow, maybeText, maybeWhole, one, text, whole } from './rows.ts';
import type { Row } from './rows.ts';
import { lane as laneTable, tab as tabTable } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
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

type RestoredRow = RestoredLane;

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

export class TabViewsRepository implements TabViews, LiveLanes {
    private readonly db: Database;
    private readonly orm: Orm;
    private readonly daemonVersion: string | null;
    private readonly tabs: TabRow;
    private readonly hasSince: boolean;

    constructor(db: Database, daemonVersion: string | null = null) {
        this.db = db;
        this.orm = ormOf(db);
        this.daemonVersion = daemonVersion;
        this.tabs = new TabRow(db);
        this.hasSince = one(db.prepare("SELECT 1 AS present FROM pragma_table_info('lane') WHERE name = 'since'")) !== null;
    }

    tabOf(pane: string): string | null {
        return guarded(() => {
            const row = this.orm.select({ tab_id: laneTable.tabId }).from(laneTable).where(eq(laneTable.pane, paneId(pane))).limit(1).get();
            return row === undefined ? null : text(row, 'tab_id');
        }, null);
    }

    readTab(tab: string): TabView | null {
        return guarded(() => {
            const row = this.orm.select({ column_pane: tabTable.columnPane, view_at: tabTable.viewAt, daemon_version: tabTable.daemonVersion }).from(tabTable)
                .where(and(eq(tabTable.id, tabId(tab)), isNotNull(tabTable.viewAt))).get();
            return row === undefined ? null : { tab, column: maybeText(row, 'column_pane'), lanes: this.orm.select(LANE_VIEW).from(laneTable).where(eq(laneTable.tabId, tabId(tab))).orderBy(asc(laneTable.position)).all().map(laneOf), at: whole(row, 'view_at'), daemonVersion: maybeText(row, 'daemon_version') };
        }, null);
    }

    liveLanes(): LiveLanesRead {
        if (!this.hasSince) {
            return { kind: 'read', lanes: [] };
        }
        try {
            return { kind: 'read', lanes: this.orm.select(LIVE_VIEW).from(laneTable).orderBy(asc(laneTable.tabId), asc(laneTable.position)).all().map((row) => restoredOrThrow(parseRestoredRow(row))) };
        } catch (error) {
            return unreadableOf(failureCauseOf(error));
        }
    }

    writeTab(view: TabView): void {
        writeTx(this.db, () => {
            this.tabs.ensure(view.tab, view.at);
            this.orm.update(tabTable).set({ columnPane: view.column, viewAt: view.at, daemonVersion: view.daemonVersion ?? this.daemonVersion }).where(eq(tabTable.id, tabId(view.tab))).run();
            this.orm.delete(laneTable).where(eq(laneTable.tabId, tabId(view.tab))).run();
            view.lanes.forEach((lane, position) => {
                const [webBase, webForge, webBranch] = webColumns(lane.web);
                const [contextTokens, contextWindow, contextSource] = contextColumns(lane.context);
                if (!this.hasSince) {
                    this.orm.run(sql`INSERT INTO lane (tab_id, pane, position, agent, status, title, cwd, last_prompt, web_base, web_forge, web_branch, context_tokens, context_window, context_source) VALUES (${view.tab}, ${lane.pane}, ${position}, ${lane.agent}, ${lane.status}, ${lane.title}, ${lane.cwd}, ${lane.lastPrompt ?? null}, ${webBase}, ${webForge}, ${webBranch}, ${contextTokens}, ${contextWindow}, ${contextSource})`);
                    return;
                }
                this.orm.insert(laneTable).values({
                    tabId: tabId(view.tab), pane: paneId(lane.pane), position, agent: lane.agent, status: lane.status, title: lane.title, cwd: lane.cwd, lastPrompt: lane.lastPrompt ?? null,
                    webBase, webForge, webBranch, contextTokens, contextWindow, contextSource, since: lane.since ?? null,
                }).run();
            });
        });
    }
}
