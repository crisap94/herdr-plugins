import type { SeenColumn } from '#src/recap/domain/fold.ts';

type Json = Readonly<Record<string, unknown>>;

export const COLUMN_TITLE = 'tab-recap';
export const BAR_TITLE = 'tab-recap:bar';
export const COLUMN_LABEL = 'Recap';

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

export function agentPanesIn(panes: readonly Json[], agents: readonly Json[]): ReadonlySet<string> {
    return new Set([
        ...agents.map((agent) => text(agent['pane_id'])),
        ...panes.filter((pane) => text(pane['agent']) !== '').map((pane) => text(pane['pane_id'])),
    ].filter((id) => id !== ''));
}

export function columnsIn(panes: readonly Json[], agentPanes: ReadonlySet<string>): readonly SeenColumn[] {
    return panes
        .filter((pane) => {
            const title = text(pane['terminal_title_stripped']);
            const label = text(pane['label']);
            return (title === COLUMN_TITLE || title === BAR_TITLE) && text(pane['agent']) === '' && !agentPanes.has(text(pane['pane_id'])) && (label === '' || label === COLUMN_LABEL);
        })
        .map((pane) => ({
            tabId: text(pane['tab_id']),
            paneId: text(pane['pane_id']),
            shape: text(pane['terminal_title_stripped']) === BAR_TITLE ? 'bar' : 'side',
        }));
}
