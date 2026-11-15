import { err, ok, must, type Result } from '#src/protocol/result.ts';
import { parseCount, type Count } from './count.ts';
import { isFields } from './fields.ts';
import { parseAgentKind, parsePaneId, parseTabId, type AgentKind, type PaneId, type TabId } from './ids.ts';
import type { ParseFailure } from './parse-failure.ts';
import { parseFlag, parseGuiStageId, type Flag, type GuiStageId } from './gui-tab-parts.ts';
import { parseGuiWriting, type GuiWriting } from './gui-tab-types.ts';
import { parseNonEmptyText, parseText, type NonEmptyText, type Text } from './text.ts';
import { instant, parseInstant, type Instant } from './time.ts';

export const INDEX_LANES_MAX = must(parseCount(8));
export const HEADLINE_MAX = must(parseCount(160));
export const LANE_NAME_MAX = must(parseCount(80));
const TABS_FIELD = 'tabs';
const RESTING: GuiWriting = 'resting';

export const UNKNOWN = must(parseNonEmptyText('unknown'));
const ZERO = must(parseCount(0));
const NO_TEXT = must(parseText(''));

export interface GuiIndexLane {
    readonly terminal: PaneId;
    readonly agent: AgentKind;
    readonly status: NonEmptyText;
    readonly name: Text;
    readonly contextPercent: Count | null;
    readonly hint: Flag;
    readonly stage: GuiStageId | null;
}

export interface GuiIndexExtras {
    readonly recapAt: Instant | null;
    readonly writing: GuiWriting;
    readonly headline: Text;
    readonly needs: Count;
    readonly waitingSince: Instant | null;
    readonly contextPercent: Count | null;
    readonly hintPercent: Count | null;
    readonly laneCount: Count;
    readonly lanes: readonly GuiIndexLane[];
}

export interface GuiIndexRow extends GuiIndexExtras {
    readonly tab: TabId;
    readonly name: NonEmptyText;
    readonly status: NonEmptyText;
    readonly at: Instant;
}

export type GuiIndex = readonly GuiIndexRow[];
export type GuiIndexLanes = readonly GuiIndexLane[];
export function orElse<T>(result: Result<T, ParseFailure>, fallback: T): T {
    return result.kind === 'ok' ? result.value : fallback;
}

const orNull = <T>(result: Result<T, ParseFailure>): T | null => (result.kind === 'ok' ? result.value : null);

export function parseGuiIndexLane(input: unknown): Result<GuiIndexLane, ParseFailure> {
    if (!isFields(input)) { return err({ kind: 'not-a-row' }); }
    const terminal = parsePaneId(input['terminal']);
    const agent = parseAgentKind(input['agent']);
    const status = parseNonEmptyText(input['status']);
    if (terminal.kind === 'err') { return terminal; }
    if (agent.kind === 'err') { return agent; }
    if (status.kind === 'err') { return status; }
    return ok({
        terminal: terminal.value, agent: agent.value, status: status.value, name: orElse(parseText(input['name']), NO_TEXT),
        contextPercent: orNull(parseCount(input['contextPercent'])), hint: parseFlag(input['hint']), stage: orNull(parseGuiStageId(input['stage'])),
    });
}

export function parseGuiIndexLanes(input: unknown): GuiIndexLanes {
    const rows: readonly unknown[] = Array.isArray(input) ? input : [];
    return rows.flatMap((row) => orNull(parseGuiIndexLane(row)) ?? []).slice(0, INDEX_LANES_MAX);
}

export function parseGuiIndexExtras(given: unknown): GuiIndexExtras {
    const input = isFields(given) ? given : {};
    return {
        recapAt: orNull(parseInstant(input['recapAt'])), writing: orElse(parseGuiWriting(input['writing']), RESTING),
        headline: orElse(parseText(input['headline']), NO_TEXT), needs: orElse(parseCount(input['needs']), ZERO),
        waitingSince: orNull(parseInstant(input['waitingSince'])), contextPercent: orNull(parseCount(input['contextPercent'])),
        hintPercent: orNull(parseCount(input['hintPercent'])), laneCount: orElse(parseCount(input['laneCount']), ZERO), lanes: parseGuiIndexLanes(input['lanes']),
    };
}

export function parseGuiIndexRow(input: unknown): Result<GuiIndexRow, ParseFailure> {
    if (!isFields(input)) { return err({ kind: 'not-a-row' }); }
    const tab = parseTabId(input['tab']);
    if (tab.kind === 'err') { return tab; }
    const at = orElse(parseCount(input['at']), ZERO);
    return ok({
        tab: tab.value, name: orElse(parseNonEmptyText(input['name']), UNKNOWN), status: orElse(parseNonEmptyText(input['status']), UNKNOWN),
        at: instant(at), ...parseGuiIndexExtras(input),
    });
}

export function parseGuiIndex(input: unknown): Result<GuiIndex, ParseFailure> {
    const found: unknown = isFields(input) ? input[TABS_FIELD] : undefined;
    if (!Array.isArray(found)) { return err({ kind: 'not-a-row' }); }
    const rows: readonly unknown[] = found;
    return ok(rows.map(parseGuiIndexRow).flatMap((row) => (row.kind === 'ok' ? [row.value] : [])));
}
