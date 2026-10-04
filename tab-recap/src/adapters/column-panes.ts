// Which panes of a herdr snapshot are OUR columns — and which host an agent, which we never touch.
import type { SeenColumn } from '#src/recap/domain/fold.ts';

type Json = Readonly<Record<string, unknown>>;

/** A column announces itself (and its shape) through its terminal title; that is how a restarted daemon finds it. */
export const COLUMN_TITLE = 'tab-recap';
export const BAR_TITLE = 'tab-recap:bar';
/** The manifest's pane title: herdr reports it as the pane's `label`. */
export const COLUMN_LABEL = 'Recap';

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** The panes that host an agent: the snapshot's agents list, plus any pane that itself carries an `agent`. */
export function agentPanesIn(panes: readonly Json[], agents: readonly Json[]): ReadonlySet<string> {
    return new Set([
        ...agents.map((agent) => text(agent['pane_id'])),
        ...panes.filter((pane) => text(pane['agent']) !== '').map((pane) => text(pane['pane_id'])),
    ].filter((id) => id !== ''));
}

/**
 * A column is a pane whose stripped title is EXACTLY `tab-recap` or `tab-recap:bar` (a session named
 * `tab-recap-harness-config` is an agent, not a column), that hosts no agent, and — when herdr reports
 * a label — whose label is the manifest's.
 */
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
