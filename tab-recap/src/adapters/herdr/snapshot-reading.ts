import { usePlugin } from './client.ts';
import { agentPanesIn, columnsIn, deadColumnsIn } from './column-panes.ts';
import { parseJsonList, parseJsonRect, parseJsonText } from './json.ts';
import { parseJson, type JsonObject } from './json-object.ts';
import { sessionOfForKind } from './session-registry.ts';
import { must } from '#src/protocol/result.ts';
import { unknown, type Unknown } from '#src/ports/unknowable.ts';
import type { FleetPaneTokens } from '#src/ports/fleet-source.ts';
import type { PaneTokensResult } from '#src/ports/pane-tokens.ts';
import { paneTokenMapOf, seenFrom, sessionOf } from '#src/recap/application/decode.ts';
import type { Reconciliation } from '#src/recap/domain/fold.ts';
import { causeOf } from '#src/recap/domain/failure-cause.ts';
import { tabId, uncheckedTokenName, uncheckedTokenValue, type PaneId, type SessionId } from '#src/recap/domain/ids.ts';
import type { SeenLane } from '#src/recap/domain/lane.ts';
import { parseText } from '#src/recap/domain/text.ts';

export const paneTokensOf = (snapshot: JsonObject): ReadonlyMap<PaneId, FleetPaneTokens> => new Map(parseJsonList(snapshot['panes']).flatMap((pane) => {
    const found = paneTokenMapOf(pane);
    return found === null ? [] : [[found.pane, new Map([...found.tokens].map(([name, value]) => [uncheckedTokenName(name), uncheckedTokenValue(value)] as const))] as const];
}));

export function reconciliationOf(snapshot: JsonObject): Reconciliation {
    const panes = parseJsonList(snapshot['panes']);
    const agents = agentPanesIn(panes, parseJsonList(snapshot['agents']));
    const lanes = parseJsonList(snapshot['agents']).map((agent) => seenFrom(agent, sessionOfForKind)).filter((lane): lane is SeenLane => lane !== null);
    const widths = new Map(parseJsonList(snapshot['layouts']).map((layout) => [parseJsonText(layout['tab_id']), parseJsonRect(layout['area']).width]));
    const focused = parseJsonText(snapshot['focused_tab_id']);
    const tabs = Array.isArray(snapshot['tabs']) ? { tabs: parseJsonList(snapshot['tabs']).map((tab) => parseJsonText(tab['tab_id'])).filter((tab) => tab !== '').map((tab) => tabId(tab)) } : {};
    return { focusedTab: focused === '' ? null : focused, lanes, panes: panes.map((pane) => parseJsonText(pane['pane_id'])), columns: columnsIn(panes, agents), dead: deadColumnsIn(panes, agents), widths, ...tabs };
}

export async function readPaneSession(pane: PaneId): Promise<SessionId | null | Unknown> {
    try {
        const info = parseJson(await usePlugin((client) => client.call('pane.get', { pane_id: pane })))['pane'];
        return typeof info === 'object' && info !== null ? sessionOf(parseJson(info), sessionOfForKind) : null;
    } catch (error) {
        return unknown({ why: 'unreachable', detail: causeOf(must(parseText(error instanceof Error ? error.message : String(error)))) });
    }
}

const paneInfoOf = async (pane: PaneId): Promise<JsonObject> => parseJson(parseJson(await usePlugin((client) => client.call('pane.get', { pane_id: pane })))['pane']);

export async function readPaneTokens(pane: PaneId): Promise<PaneTokensResult> {
    try {
        const tokens = parseJson((await paneInfoOf(pane))['tokens']);
        return { kind: 'tokens', tokens: new Map(Object.entries(tokens).flatMap(([name, raw]) => (typeof raw === 'string' ? [[must(parseText(name)), must(parseText(raw))] as const] : []))) };
    } catch (error) {
        return unknown({ why: 'unreachable', detail: causeOf(must(parseText(error instanceof Error ? error.message : String(error)))) });
    }
}
