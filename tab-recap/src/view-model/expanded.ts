import type { ExpandedView, SessionRecap } from '@stateforge-labs/recap-view';
import { expanded as drawExpanded } from '@stateforge-labs/recap-view/unstable/expanded.ts';
import type { Messages } from '#src/i18n/messages.ts';
import type { SessionFacts } from '#src/recap/domain/session-facts.ts';

export { EXPANDED_TWO_COLUMNS, columnWidth } from '@stateforge-labs/recap-view/unstable/expanded.ts';
export type { ExpandedTask } from '@stateforge-labs/recap-view';
export type { PluginExpandedView as ExpandedView };

interface PluginExpandedView extends Omit<ExpandedView<string>, 'session' | 'wording'> {
    readonly session: SessionFacts;
    readonly messages: Messages;
}

export interface ExpandedPresented extends ExpandedView<string> {}

export function sessionRecapOf(facts: SessionFacts): SessionRecap {
    return {
        started: facts.started,
        runs: facts.runs,
        compactions: facts.compactions,
        agents: facts.agents,
        repo: facts.repo,
        files: facts.files,
        chapters: facts.chapters,
        autocompact: facts.autocompact,
    };
}

export function expandedViewOf(view: PluginExpandedView): ExpandedPresented {
    const { session, messages, ...rest } = view;
    return { ...rest, session: sessionRecapOf(session), wording: messages };
}

const expandedDrawing =
    <Drawn>(draw: (view: ExpandedPresented) => Drawn) =>
    (view: PluginExpandedView): Drawn =>
        draw(expandedViewOf(view));

export const expanded = expandedDrawing(drawExpanded);
