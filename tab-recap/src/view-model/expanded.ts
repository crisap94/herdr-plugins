import type { ExpandedView, SessionRecap } from '@stateforge-labs/recap-view';
import { parseAgentLabel, parseBranchName, parseDuration, parseFilePath, parseInstant, parseRepoName, parseTokens } from '@stateforge-labs/recap-view';
import { parseCount, parsePercent } from '@stateforge-labs/recap-view/unstable/wording.ts';
import { expanded as drawExpanded } from '@stateforge-labs/recap-view/unstable/expanded.ts';
import type { Messages } from '#src/i18n/messages.ts';
import type { SessionFacts } from '#src/recap/domain/session-facts.ts';
import { maybe } from './column.ts';

export { EXPANDED_TWO_COLUMNS, columnWidth } from '@stateforge-labs/recap-view/unstable/expanded.ts';
export type { ExpandedTask } from '@stateforge-labs/recap-view';
export type { PluginExpandedView as ExpandedView };

interface PluginExpandedView extends Omit<ExpandedView<string>, 'session' | 'wording'> {
    readonly session: SessionFacts;
    readonly messages: Messages;
}

export interface ExpandedPresented extends ExpandedView<string> {}

export function sessionRecapOf(facts: SessionFacts): SessionRecap {
    const { started, runs, compactions, repo, autocompact } = facts;
    return {
        started: started === null ? null : { at: parseInstant(started.at), forMs: parseDuration(started.forMs) },
        runs: runs === null ? null : { total: parseCount(runs.total), byCause: runs.byCause.map((run) => ({ cause: run.cause, count: parseCount(run.count) })) },
        compactions: compactions === null ? null : {
            count: parseCount(compactions.count),
            byOrigin: { operator: parseCount(compactions.byOrigin.operator), auto: parseCount(compactions.byOrigin.auto) },
            measured: compactions.measured.map((pair) => ({ before: parseTokens(pair.before), after: parseTokens(pair.after) })),
        },
        agents: facts.agents.map((agent) => ({ label: parseAgentLabel(agent.label), share: parsePercent(agent.share), window: parseTokens(agent.window) })),
        repo: repo === null ? null : { name: parseRepoName(repo.name), branch: maybe(repo.branch, parseBranchName) },
        files: facts.files.map((file) => ({ path: parseFilePath(file.path), count: parseCount(file.count) })),
        chapters: maybe(facts.chapters, parseCount),
        autocompact: autocompact === null ? null : { decisions: parseCount(autocompact.decisions), compacted: parseCount(autocompact.compacted), waited: parseCount(autocompact.waited) },
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
