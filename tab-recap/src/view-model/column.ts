import type { Break, ColumnTask, ColumnView, CompactionRow, RecapColumn, Row, Style, Web, Wording } from '@stateforge-labs/recap-view';
import { parseAgentName, parseBranchName, parseDirectory, parseDuration, parseFromScreen, parseInstant, parsePaneId, parseProse, parseQueued, parseRunning, parseTaskName, parseTitle, parseTokens, parseWebBase } from '@stateforge-labs/recap-view';
import type { CompactionRecord } from '#src/ports/compaction-records.ts';
import type { Break as LedgerBreak } from '#src/ports/boundaries.ts';
import type { LaneCursor, TabRecap } from '#src/ports/recap-records.ts';
import { isScreenSource } from '#src/ports/screens.ts';
import type { LaneWeb, TabLane, TabView } from '#src/ports/tab-views.ts';
import type { Messages } from '#src/i18n/messages.ts';
import type { RecapTask } from '#src/recap/domain/tasks.ts';
import { laneStatus } from '#src/recap/domain/status.ts';
import { sourcePathOf } from '#src/ports/transcripts.ts';

export interface PluginColumnView extends Omit<ColumnView<string>, 'rows' | 'daemonVersion' | 'recap' | 'wording' | 'compactions'> {
    readonly tab: TabView | null;
    readonly recap: TabRecap | null;
    readonly messages: Messages;
    readonly compactions?: readonly CompactionRecord[];
}

export interface PresentedView extends ColumnView<string> {}

export function maybe<In, Out>(value: In | null, parse: (input: In) => Out): Out | null {
    return value === null ? null : parse(value);
}

export function wordingOf<Text>(wording: Wording<Text>): Wording<Text> {
    return wording;
}

export function webOf(web: LaneWeb): Web {
    return { base: parseWebBase(web.base), forge: web.forge, branch: maybe(web.branch, parseBranchName) };
}

function laneExtras(lane: TabLane): Partial<Row> {
    const { context, web } = lane;
    return {
        ...(lane.lastPrompt === undefined ? {} : { lastPrompt: maybe(lane.lastPrompt, parseProse) }),
        ...(web === undefined ? {} : { web: web === null ? null : webOf(web) }),
        ...(context === undefined ? {} : { context: context === null ? null : { tokens: context.tokens, window: context.window, source: context.source } }),
        ...(lane.since === undefined ? {} : { since: maybe(lane.since, parseInstant) }),
    };
}

export function rowOf(lane: TabLane, cursor: LaneCursor | undefined): Row {
    return {
        ...laneExtras(lane),
        id: parsePaneId(lane.pane),
        agent: parseAgentName(lane.agent),
        state: laneStatus(lane.status),
        title: maybe(lane.title, parseTitle),
        cwd: maybe(lane.cwd, parseDirectory),
        fromScreen: parseFromScreen(cursor !== undefined && isScreenSource(sourcePathOf(cursor.transcript))),
        harnessRecap: maybe(cursor?.claudeRecap ?? null, parseProse),
    };
}

function columnRowOf(lane: TabLane, cursor: LaneCursor | undefined): Row {
    return { ...rowOf(lane, cursor), title: maybe(cursor?.title ?? lane.title, parseTitle), lastPrompt: maybe(lane.lastPrompt ?? cursor?.lastPrompt ?? null, parseProse) };
}

export function columnTaskOf(task: RecapTask): ColumnTask {
    return { name: parseTaskName(task.name), members: task.lanes.map(parsePaneId), sections: task.sections, markdown: parseProse(task.markdown) };
}

export function recapColumnOf(recap: TabRecap): RecapColumn {
    return { tasks: recap.tasks.map(columnTaskOf), at: maybe(recap.at, parseInstant), running: parseRunning(recap.running), backend: maybe(recap.backend, parseAgentName), error: maybe(recap.error, parseProse) };
}

export function viewBreakOf(found: LedgerBreak): Break {
    return { kind: found.kind, at: parseInstant(found.at), trigger: found.trigger, tokensBefore: maybe(found.tokensBefore, parseTokens), tokensAfter: maybe(found.tokensAfter, parseTokens), tookMs: maybe(found.tookMs, parseDuration) };
}

export function compactionRowOf(record: CompactionRecord): CompactionRow {
    return {
        pane: parsePaneId(record.pane),
        stage: record.stage,
        brief: record.brief,
        writer: maybe(record.writer, parseAgentName),
        why: maybe(record.why, parseProse),
        stageAt: parseInstant(record.stageAt),
        queued: parseQueued(record.queued),
        tokensBefore: maybe(record.tokensBefore, parseTokens),
        tokensAfter: maybe(record.tokensAfter, parseTokens),
        tookMs: maybe(record.tookMs, parseDuration),
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
    return { ...compactionRowOf(record), agent: parseAgentName(record.agent), startedAt: parseInstant(record.startedAt) };
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
