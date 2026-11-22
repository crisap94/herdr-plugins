import type { GuardedRecapRecords } from '#src/ports/guarded-reads.ts';
import type { TabRecaps } from '#src/engine/tab-recaps.ts';
import type { Waiting } from '#src/recap/application/autocompact.ts';
import { RECAP_WAIT_MS } from '#src/recap/application/recap-wait.ts';
import type { RefreshStatus } from '#src/recap/domain/freshness.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import { refreshWithin } from './refresh-status.ts';
import { awaitingPane } from './autocompact.ts';
import { must } from '#src/protocol/result.ts';
import { handoff } from '#src/protocol/exchanges/handoff.ts';
import type { TokenMap } from '#src/protocol/tokens.ts';
import type { CompactRequests } from '#src/recap/application/compact-requests.ts';
import { herdrEventsFrom } from '#src/recap/domain/herdr-events.ts';
import { capabilityOf } from '#src/recap/domain/lane-tokens.ts';
import { notesOf } from '#src/recap/domain/coordination.ts';
import { paneId, uncheckedAgentKind } from '#src/recap/domain/ids.ts';
import { duration, type Duration } from '#src/recap/domain/time.ts';
import { environmentName } from '#src/recap/domain/backend.ts';
import { parseText, textOf, type Text } from '#src/recap/domain/text.ts';
import type { HandoffExchangeWiring } from './handoff-exchange-wiring.ts';
import type { Worktrees } from './worktrees.ts';
import type { Informer } from '#src/recap/application/informer.ts';
import { listsPane } from '#src/recap/domain/board.ts';
import { ANY_KIND } from '#src/recap/domain/policy.ts';
import type { AgentKind } from '#src/recap/domain/ids.ts';
import type { Box } from './dispatch-parts.ts';
import { loadSettings, parseSettingsFile, settingReader } from './config.ts';

export function logVia(write: (line: Text) => void): (line: string) => void {
    return (line) => { write(must(parseText(line))); };
}

export function pauseVia(pause: (span: Duration) => Promise<void>): (ms: number) => Promise<void> {
    return (ms) => pause(duration(ms));
}

export function refreshVia(recaps: Pick<TabRecaps, 'refresh'>, records: Pick<GuardedRecapRecords, 'readRecap'>): (tab: string, lanes: readonly Lane[]) => Promise<RefreshStatus> {
    return (tab, lanes) => refreshWithin(recaps.refresh(tabId(tab), lanes), records, tabId(tab), duration(RECAP_WAIT_MS));
}

export function awaitingNow(pane: string): Promise<Waiting> {
    return awaitingPane(paneId(pane));
}

function switchOn(setting: string): boolean {
    return setting === handoff.optIn ? loadSettings().handoffRequests === 'on' : herdrEventsFrom(settingReader()(environmentName(textOf(setting)))) === 'on';
}

export function capabilityNow(): string {
    return capabilityOf(switchOn);
}

export function failureLog(log: (line: string) => void, what: string): (error: unknown) => void {
    return (error) => { log(`${what}: ${error instanceof Error ? error.message : String(error)}`); };
}

export function paneTokensTo(worktrees: Worktrees, answers: CompactRequests, exchange: HandoffExchangeWiring): (pane: string, tokens: TokenMap) => void {
    return (pane, tokens) => {
        worktrees.feed.update(paneId(pane), notesOf(tokens));
        answers.onPaneTokens(pane, tokens);
        exchange.responder.onPaneTokens(paneId(pane), new Map(Object.entries(tokens).map(([name, raw]): [Text, Text] => [must(parseText(name)), must(parseText(raw))])));
    };
}

export function parseEnv(text: string): ReadonlyMap<string, string> {
    return must(parseSettingsFile(text));
}

export function listsPaneIn(informer: Pick<Informer, 'current'>): (pane: string) => boolean {
    return (pane) => listsPane(informer.current, paneId(pane));
}

export function ceilingOverrideNow(): boolean {
    return loadSettings().autocompact.ceilingPolicy === 'overrides-check';
}

export function herdrEventsOn(): boolean {
    return loadSettings().herdrEvents === 'on';
}

export function wantsScreen(agent: AgentKind): boolean {
    const { screenAgents } = loadSettings();
    return screenAgents.includes(uncheckedAgentKind(ANY_KIND)) || screenAgents.includes(agent);
}

export function listeningIn(box: Box): () => boolean {
    return () => box.informer?.listening ?? false;
}
