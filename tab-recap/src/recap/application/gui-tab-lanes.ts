import type { Messages } from '#src/i18n/index.ts';
import type { CompactionRow } from '#src/ports/compaction-records.ts';
import { DEFAULT_MARK, type PaneNote } from '#src/ports/extension.ts';
import type { Recap } from '#src/ports/recap-records.ts';
import { isScreenSource } from '#src/ports/screens.ts';
import type { LaneWebRecord, TabLaneRecord } from '#src/ports/tab-views.ts';
import { must } from '#src/protocol/result.ts';
import { GIT_NOTE_MARK } from '#src/extensions/stored-notes.ts';
import { hintFor, shareOf, type ContextUse } from '#src/recap/domain/compaction.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import { orElse, UNKNOWN, type GuiLane } from '#src/recap/domain/gui-tab.ts';
import { NO, YES, type Flag, type GuiCompaction, type GuiContext, type GuiGit, type GuiNote, type GuiNoteKind, type GuiStage, type GuiWeb } from '#src/recap/domain/gui-tab-parts.ts';
import { parseAgentKind, parsePaneId, type SessionKey } from '#src/recap/domain/ids.ts';
import { changedOf } from '#src/recap/domain/worktree.ts';
import { parseNonEmptyText, parseText, type Text } from '#src/recap/domain/text.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import { stageLine } from '#src/recap/render/compaction-stage.ts';
import { plain } from '#src/recap/render/wrap.ts';
import type { GuiReads } from './gui-tab-reads.ts';
import { sourcePathOf } from '#src/ports/transcripts.ts';

export interface LaneDraw {
    readonly reads: GuiReads;
    readonly messages: Messages;
    readonly now: Instant;
    readonly recap: Recap;
}

function contextOf(use: ContextUse | null | undefined): GuiContext | null {
    if (use === null || use === undefined || use.window <= 0) { return null; }
    const tokens = parseCount(use.tokens);
    const window = parseCount(use.window);
    const share = parseCount(Math.max(0, shareOf(use)));
    return tokens.kind === 'ok' && window.kind === 'ok' && share.kind === 'ok' ? { tokens: tokens.value, window: window.value, share: share.value, source: use.source } : null;
}

function percentOf(use: ContextUse | null | undefined): GuiLane['contextPercent'] {
    return use === null || use === undefined || use.window <= 0 ? null : orElse(parseCount(Math.min(100, Math.round((use.tokens / use.window) * 100))), null);
}

function stageOf(record: CompactionRow, draw: LaneDraw): GuiStage {
    return {
        id: orElse(parseNonEmptyText(record.id), UNKNOWN), stage: record.stage, queued: record.queue === 'queued' ? YES : NO,
        writer: orElse(parseText(record.writer), null), brief: record.brief, why: orElse(parseText(record.why), null),
        startedAt: instant(record.startedAt), stageAt: instant(record.stageAt), tokensBefore: orElse(parseCount(record.tokensBefore), null),
        tokensAfter: orElse(parseCount(record.tokensAfter), null), tookMs: orElse(parseCount(record.took === null ? null : Math.round(record.took)), null),
        origin: record.origin, text: must(parseText(stageLine(record, draw.now, { messages: draw.messages, style: plain }))),
    };
}

function compactionOf(lane: TabLaneRecord, draw: LaneDraw): GuiCompaction {
    const record = draw.reads.compactions.find((each) => each.pane === lane.pane);
    if (record !== undefined) { return { hint: null, stage: stageOf(record, draw) }; }
    const percent = hintFor(lane.context, draw.reads.compactHint);
    const window = parseCount(lane.context?.window);
    const share = parseCount(percent);
    return { hint: share.kind === 'ok' && window.kind === 'ok' ? { percent: share.value, window: window.value } : null, stage: null };
}

function kindOf(note: PaneNote): GuiNoteKind {
    if (note.mark === GIT_NOTE_MARK) { return 'git'; }
    if (note.mark === undefined) { return note.at === null ? 'token' : 'alert'; }
    return note.mark === DEFAULT_MARK ? 'alert' : 'extension';
}

function noteOf(note: PaneNote): GuiNote {
    return { mark: must(parseText(note.mark ?? DEFAULT_MARK)), label: must(parseText(note.label)), at: note.at === null ? null : instant(note.at), details: note.details.map(parseText).map(must), kind: kindOf(note) };
}

function gitOf(lane: TabLaneRecord, draw: LaneDraw): GuiGit | null {
    const pane = parsePaneId(lane.pane);
    const status = pane.kind === 'ok' ? draw.reads.git(pane.value) : null;
    return status === null ? null : { branch: status.branch, ahead: status.ahead, changed: changedOf(status) };
}

function webOf(web: LaneWebRecord | null | undefined): GuiWeb | null {
    return web === null || web === undefined ? null : { base: must(parseText(web.base)), forge: web.forge, branch: orElse(parseText(web.branch), null) };
}

type Cursor = Recap['lanes'][number] | undefined;

const promptOf = (lane: TabLaneRecord, cursor: Cursor): GuiLane['lastPrompt'] => orElse(parseText(lane.lastPrompt ?? cursor?.lastPrompt), null);

const headingOf = (lane: TabLaneRecord, cursor: Cursor): Text => must(parseText(cursor?.title ?? lane.title ?? lane.pane));

const fromScreenOf = (cursor: Cursor): Flag => (cursor !== undefined && isScreenSource(sourcePathOf(cursor.transcript)) ? YES : NO);

const notesFor = (pane: SessionKey, draw: LaneDraw): readonly GuiNote[] => draw.reads.notes(pane).map(noteOf);

export function guiLaneOf(lane: TabLaneRecord, draw: LaneDraw): GuiLane | null {
    const pane = parsePaneId(lane.pane);
    const agent = parseAgentKind(lane.agent);
    if (pane.kind === 'err' || agent.kind === 'err') { return null; }
    const cursor = draw.recap.lanes.find((each) => each.pane === lane.pane);
    return {
        pane: pane.value, agent: agent.value, status: orElse(parseNonEmptyText(lane.status), UNKNOWN), title: orElse(parseText(lane.title), null), cwd: orElse(parseDirectory(lane.cwd), null),
        lastPrompt: promptOf(lane, cursor), branch: orElse(parseText(lane.web?.branch), null),
        contextPercent: percentOf(lane.context), since: lane.since ?? null,
        heading: headingOf(lane, cursor), fromScreen: fromScreenOf(cursor),
        context: contextOf(lane.context), compaction: compactionOf(lane, draw), notes: notesFor(pane.value, draw),
        git: gitOf(lane, draw), web: webOf(lane.web),
    };
}
