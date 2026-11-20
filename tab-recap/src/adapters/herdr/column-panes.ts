import type { SeenColumn } from '#src/recap/domain/fold.ts';
import type { DeadColumn } from '#src/recap/domain/dead-columns.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import type { Shape } from '#src/recap/domain/board.ts';
import { parsePaneId, parseTabId, type PaneId } from '#src/recap/domain/ids.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import type { JsonObject } from './json-object.ts';

export type AgentPaneSet = ReadonlySet<PaneId>;
export type OptionalPaneId = PaneId | null;
export type OptionalText = Text | null;

export const COLUMN_TITLE = 'tab-recap';
export const BAR_TITLE = 'tab-recap:bar';
export const COLUMN_LABEL = 'Recap';
const RELAY_TAIL = ':relay';

export function parseOptionalText(input: unknown): OptionalText {
    const found = parseText(input);
    return found.kind === 'ok' ? found.value : null;
}

export function parseOptionalPaneId(input: unknown): OptionalPaneId {
    const found = parsePaneId(input);
    return found.kind === 'ok' ? found.value : null;
}

export function agentPanesIn(panes: readonly JsonObject[], agents: readonly JsonObject[]): AgentPaneSet {
    return new Set([
        ...agents.map((agent) => parseOptionalPaneId(agent['pane_id'])),
        ...panes.filter((pane) => (parseOptionalText(pane['agent']) ?? '') !== '').map((pane) => parseOptionalPaneId(pane['pane_id'])),
    ].filter((id): id is PaneId => id !== null));
}

const titleShape = (title: OptionalText): Shape => (title === BAR_TITLE ? 'bar' : 'side');

const columnShape = (title: OptionalText, label: OptionalText, agent: OptionalText): Shape | null =>
    (title === COLUMN_TITLE || title === BAR_TITLE) && (agent ?? '') === '' && (label === null || label === '' || label === COLUMN_LABEL)
        ? titleShape(title)
        : null;

export function columnsIn(panes: readonly JsonObject[], agentPanes: ReadonlySet<string>): readonly SeenColumn[] {
    return panes.flatMap((pane): readonly SeenColumn[] => {
        const paneId = parseOptionalPaneId(pane['pane_id']);
        const shape = columnShape(parseOptionalText(pane['terminal_title_stripped']), parseOptionalText(pane['label']), parseOptionalText(pane['agent']));
        return paneId === null || shape === null || agentPanes.has(paneId) ? [] : [{ tabId: parseOptionalText(pane['tab_id']) ?? '', paneId, shape }];
    });
}

const deadShell = (pane: JsonObject): Presence => {
    const title = parseOptionalText(pane['terminal_title_stripped']) ?? '';
    const shell = parseOptionalText(pane['label']) === COLUMN_LABEL && (parseOptionalText(pane['agent']) ?? '') === '';
    return shell && title !== COLUMN_TITLE && title !== BAR_TITLE && !title.endsWith(RELAY_TAIL) ? 'present' : 'absent';
};

export function deadColumnsIn(panes: readonly JsonObject[], agentPanes: AgentPaneSet): readonly DeadColumn[] {
    return panes.flatMap((pane): readonly DeadColumn[] => {
        const tab = parseTabId(pane['tab_id']);
        const paneId = parsePaneId(pane['pane_id']);
        return tab.kind === 'err' || paneId.kind === 'err' || deadShell(pane) === 'absent' || agentPanes.has(paneId.value) ? [] : [{ tab: tab.value, pane: paneId.value }];
    });
}
