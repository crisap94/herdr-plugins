import type { ColumnTask, ColumnView, CompactionRow, RecapColumn, Row, Style, Web, Wording } from '@stateforge-labs/recap-view';
import type { CompactionRecord } from '#src/ports/compaction-records.ts';
import type { LaneCursor, TabRecap } from '#src/ports/recap-records.ts';
import { isScreenSource } from '#src/ports/screens.ts';
import type { LaneWeb, TabLane } from '#src/ports/tab-views.ts';
import type { ColumnView as PluginColumnView } from '#src/recap/render/present.ts';
import type { RecapTask } from '#src/recap/domain/tasks.ts';
import { laneStatus } from '#src/recap/domain/status.ts';

export function wordingOf<Text>(wording: Wording<Text>): Wording<Text> {
    return wording;
}

export function webOf(web: LaneWeb): Web {
    return { base: web.base, forge: web.forge, branch: web.branch };
}

function laneExtras(lane: TabLane): Partial<Row> {
    const { context, web } = lane;
    return {
        ...(lane.lastPrompt === undefined ? {} : { lastPrompt: lane.lastPrompt }),
        ...(web === undefined ? {} : { web: web === null ? null : webOf(web) }),
        ...(context === undefined ? {} : { context: context === null ? null : { tokens: context.tokens, window: context.window } }),
        ...(lane.since === undefined ? {} : { since: lane.since }),
    };
}

export function rowOf(lane: TabLane, cursor: LaneCursor | undefined): Row {
    return {
        ...laneExtras(lane),
        id: lane.pane,
        agent: lane.agent,
        state: laneStatus(lane.status),
        title: lane.title,
        cwd: lane.cwd,
        fromScreen: cursor !== undefined && isScreenSource(cursor.transcript),
        harnessRecap: cursor?.claudeRecap ?? null,
    };
}

export function columnTaskOf(task: RecapTask): ColumnTask {
    return { name: task.name, members: task.lanes, sections: task.sections, markdown: task.markdown };
}

export function recapColumnOf(recap: TabRecap): RecapColumn {
    return { tasks: recap.tasks.map(columnTaskOf), at: recap.at, running: recap.running, backend: recap.backend, error: recap.error };
}

export function compactionRowOf(record: CompactionRecord): CompactionRow {
    return {
        pane: record.pane,
        stage: record.stage,
        brief: record.brief,
        writer: record.writer,
        why: record.why,
        stageAt: record.stageAt,
        queued: record.queued,
        tokensBefore: record.tokensBefore,
        tokensAfter: record.tokensAfter,
        tookMs: record.tookMs,
    };
}

function columnExtras<Text>(view: PluginColumnView, style: Style<Text> | undefined): Partial<ColumnView<Text>> {
    return {
        ...(view.version === undefined ? {} : { version: view.version }),
        ...(view.compactHint === undefined ? {} : { compactHint: view.compactHint }),
        ...(view.compactions === undefined ? {} : { compactions: view.compactions.map(compactionRowOf) }),
        ...(style === undefined ? {} : { style }),
    };
}

export function columnViewOf<Text>(view: PluginColumnView, wording: Wording<Text>, style?: Style<Text>): ColumnView<Text> {
    const cursors = view.recap?.lanes ?? [];
    return {
        ...columnExtras(view, style),
        rows: view.tab === null ? null : view.tab.lanes.map((lane) => rowOf(lane, cursors.find((cursor) => cursor.pane === lane.pane))),
        daemonVersion: view.tab?.daemonVersion ?? null,
        recap: view.recap === null ? null : recapColumnOf(view.recap),
        notes: view.notes,
        warnings: view.warnings,
        now: view.now,
        wording,
    };
}
