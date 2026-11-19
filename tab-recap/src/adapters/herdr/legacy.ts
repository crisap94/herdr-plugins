import { setTimeout as sleep } from 'node:timers/promises';
import type { Agents, AgentState, LineBehavior, PromptBehavior, PromptWait, Prompted, PromptStance, PromptWaitFor } from '#src/ports/agents.ts';
import type { Done } from '#src/ports/columns.ts';
import type { CompactionLine } from '#src/recap/domain/compaction-plan.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { causeOf } from '#src/recap/domain/failure-cause.ts';
import { parseMilliseconds } from '#src/recap/domain/time.ts';
import { agentPanesIn, columnsIn } from './column-panes.ts';
import { seenFrom, tokensOf } from '#src/recap/application/decode.ts';
import { sessionOfForKind } from './session-registry.ts';
import type { TokenMap } from '#src/protocol/tokens.ts';
import type { Reconciliation } from '#src/recap/domain/fold.ts';
import { parsePaneId, parseTabId, tabId, type PaneId, type TabId } from '#src/recap/domain/ids.ts';
import type { Placed, Rect, Split } from '#src/recap/domain/layout.ts';
import type { SeenLane } from '#src/recap/domain/lane.ts';
import type { LayoutResult } from '#src/ports/columns.ts';
import type { Json } from './json-object.ts';
import { HerdrAgentPanes, type Wire } from './agents.ts';

export function parseJson(value: unknown): Json {
    return typeof value === 'object' && value !== null ? { ...value } : {};
}

export function list(value: unknown): readonly Json[] {
    return Array.isArray(value) ? value.filter((item): item is Json => typeof item === 'object' && item !== null) : [];
}

export function str(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

export function rectOf(value: unknown): Rect {
    const r = parseJson(value);
    const n = (key: string): number => (typeof r[key] === 'number' ? r[key] : 0);
    return { x: n('x'), y: n('y'), width: n('width'), height: n('height') };
}

export function reconciliationOf(snapshot: Json): Reconciliation {
    const panes = list(snapshot['panes']);
    const agents = agentPanesIn(panes, list(snapshot['agents']));
    const lanes = list(snapshot['agents']).map((agent) => seenFrom(agent, sessionOfForKind)).filter((lane): lane is SeenLane => lane !== null);
    const widths = new Map(list(snapshot['layouts']).map((layout) => [str(layout['tab_id']), rectOf(layout['area']).width]));
    const focused = str(snapshot['focused_tab_id']);
    const tabs = Array.isArray(snapshot['tabs']) ? { tabs: list(snapshot['tabs']).map((tab) => str(tab['tab_id'])).filter((tab) => tab !== '').map((tab) => tabId(tab)) } : {};
    return { focusedTab: focused === '' ? null : focused, lanes, panes: panes.map((pane) => str(pane['pane_id'])), columns: columnsIn(panes, agents), widths, ...tabs };
}

export function paneTokensOf(snapshot: Json): ReadonlyMap<string, TokenMap> {
    return new Map(list(snapshot['panes']).flatMap((pane) => {
        const found = tokensOf(pane);
        return found === null ? [] : [[found.pane, found.tokens] as const];
    }));
}

export function layoutOf(layout: Json): LayoutResult {
    const panes: Placed[] = list(layout['panes']).map((pane) => ({ paneId: str(pane['pane_id']), rect: rectOf(pane['rect']) }));
    const splits: Split[] = list(layout['splits']).map((split) => ({
        direction: str(split['direction']),
        ratio: typeof split['ratio'] === 'number' ? split['ratio'] : 0.5,
        rect: rectOf(split['rect']),
    }));
    const area = rectOf(layout['area']);
    const focused = str(layout['focused_pane_id']);
    return { kind: 'layout', width: area.width, height: area.height, focused: focused === '' ? null : focused, panes, splits };
}

const paneOf = (pane: string): PaneId | null => {
    const found = parsePaneId(pane);
    return found.kind === 'ok' ? found.value : null;
};

const tabOf = (tab: string): TabId | null => {
    const found = parseTabId(tab);
    return found.kind === 'ok' ? found.value : null;
};

export class HerdrAgents implements Agents {
    private readonly panes: HerdrAgentPanes;

    constructor(wire: Wire, plugin: { readonly id: string; readonly stateDir: string }, pause: (ms: number) => Promise<void> = sleep) {
        this.panes = new HerdrAgentPanes(wire, { id: must(parseText(plugin.id)), stateDir: must(parseText(plugin.stateDir)) }, (wait) => pause(Number(wait)));
    }

    async status(pane: string): Promise<AgentState> {
        const id = paneOf(pane);
        return id === null ? unknown({ why: 'not-found', what: `agent ${pane}` }) : this.panes.status(id);
    }

    async prompt(pane: string, text: string, wait: PromptWait | undefined, behavior: PromptBehavior): Promise<Prompted> {
        const id = paneOf(pane);
        const body = parseText(text);
        if (id === null) {
            return unknown({ why: 'not-found', what: `agent ${pane}` });
        }
        if (body.kind !== 'ok') {
            return unknown({ why: 'unreadable', detail: causeOf(must(parseText('prompt text is empty'))) });
        }
        const stance: PromptStance = { stall: behavior.acceptsStall ? 'accepts-stall' : 'refuses-stall' };
        const waitFor: PromptWaitFor | undefined = wait === undefined
            ? undefined
            : { until: wait.until.flatMap((item) => { const found = parseText(item); return found.kind === 'ok' ? [found.value] : []; }), timeout: must(parseMilliseconds(wait.timeoutMs)) };
        return this.panes.prompt(id, body.value, waitFor, stance);
    }

    async typeLine(pane: string, line: CompactionLine, behavior: LineBehavior): Promise<Prompted> {
        const id = paneOf(pane);
        return id === null ? unknown({ why: 'not-found', what: `agent ${pane}` }) : this.panes.typeLine(id, line, behavior);
    }

    async askNote(tab: string, pane: string | null): Promise<Done> {
        const tabIdentity = tabOf(tab);
        const paneIdentity = pane === null ? null : paneOf(pane);
        if (tabIdentity === null || (pane !== null && paneIdentity === null)) {
            return unknown({ why: 'not-found', what: `tab ${tab}` });
        }
        return this.panes.askNote(tabIdentity, paneIdentity);
    }
}
