import type { ColumnTask, ColumnView, CompactionRow, RecapColumn, Row, Style, Web, Wording } from '@stateforge-labs/recap-view';
import type { CompactionRecord } from '#src/ports/compaction-records.ts';
import type { LaneCursor, TabRecap } from '#src/ports/recap-records.ts';
import { isScreenSource } from '#src/ports/screens.ts';
import type { LaneWeb, TabLane, TabView } from '#src/ports/tab-views.ts';
import type { Messages } from '#src/i18n/messages.ts';
import type { RecapTask } from '#src/recap/domain/tasks.ts';
import { laneStatus } from '#src/recap/domain/status.ts';

export interface PluginColumnView extends Omit<ColumnView<string>, 'rows' | 'daemonVersion' | 'recap' | 'wording' | 'compactions'> {
    readonly tab: TabView | null;
    readonly recap: TabRecap | null;
    readonly messages: Messages;
    readonly compactions?: readonly CompactionRecord[];
}

export interface PresentedView extends ColumnView<string> {}

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
        ...(context === undefined ? {} : { context: context === null ? null : { tokens: context.tokens, window: context.window, source: context.source } }),
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

function columnRowOf(lane: TabLane, cursor: LaneCursor | undefined): Row {
    return { ...rowOf(lane, cursor), title: cursor?.title ?? lane.title, lastPrompt: lane.lastPrompt ?? cursor?.lastPrompt ?? null };
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
        rows: view.tab === null ? null : view.tab.lanes.map((lane) => columnRowOf(lane, cursors.find((cursor) => cursor.pane === lane.pane))),
        daemonVersion: view.tab?.daemonVersion ?? null,
        recap: view.recap === null ? null : recapColumnOf(view.recap),
        notes: view.notes,
        warnings: view.warnings,
        now: view.now,
        wording,
    };
}

export function stageRowOf(record: CompactionRecord): CompactionRow {
    return { ...compactionRowOf(record), agent: record.agent, startedAt: record.startedAt };
}

export function presentedOf(view: PluginColumnView): PresentedView {
    const mapped = columnViewOf(view, view.messages, view.style);
    return view.compactions === undefined ? mapped : { ...mapped, compactions: view.compactions.map(stageRowOf) };
}

export const viewDrawing =
    <Width, Shape, Drawn>(draw: (view: PresentedView, width: Width, markdown: Shape) => Drawn) =>
    (view: PluginColumnView, width: Width, markdown: Shape): Drawn =>
        draw(presentedOf(view), width, markdown);

export const barDrawing =
    <Width, Drawn>(draw: (view: PresentedView, width: Width) => Drawn) =>
    (view: PluginColumnView, width: Width): Drawn =>
        draw(presentedOf(view), width);
