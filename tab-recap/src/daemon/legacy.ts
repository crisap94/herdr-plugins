import type { Waiting } from '#src/recap/application/autocompact.ts';
import { awaitingPane } from './autocompact.ts';
import { must } from '#src/protocol/result.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import { handoff } from '#src/protocol/exchanges/handoff.ts';
import type { TokenMap } from '#src/protocol/tokens.ts';
import type { CompactRequestQueue } from '#src/recap/application/compact-requests.ts';
import { parseWireText, type OptIn, type TokenValue, type WireText } from '#src/protocol/primitives.ts';
import type { Setting } from '#src/protocol/capability.ts';
import { herdrEventsFrom } from '#src/recap/domain/herdr-events.ts';
import { capabilityOf } from '#src/recap/domain/lane-tokens.ts';
import { notesOf } from '#src/recap/domain/coordination.ts';
import { paneId, uncheckedAgentKind } from '#src/recap/domain/ids.ts';
import { duration, type Duration } from '#src/recap/domain/time.ts';
import { environmentName } from '#src/recap/domain/backend.ts';
import { parseText, textOf, type Text } from '#src/recap/domain/text.ts';
import type { HandoffExchangeWiring } from './handoff-exchange-wiring.ts';
import type { Worktrees } from './worktrees.ts';
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

export function awaitingNow(pane: string): Promise<Waiting> {
    return awaitingPane(paneId(textOf(pane)));
}

function switchOn(setting: OptIn): Setting {
    return (setting === handoff.optIn ? loadSettings().handoffRequests === 'on' : herdrEventsFrom(settingReader()(environmentName(textOf(setting)))) === 'on') ? 'on' : 'off';
}

export function capabilityNow(): TokenValue {
    return capabilityOf(switchOn);
}

export function failureLog(log: (line: string) => void, what: string): (error: unknown) => void {
    return (error) => { log(`${what}: ${error instanceof Error ? error.message : String(error)}`); };
}

const wireMap = (tokens: TokenMap): ReadonlyMap<WireText, WireText> => {
    const wire = new Map<WireText, WireText>();
    for (const [name, raw] of Object.entries(tokens)) {
        const key = parseWireText(name);
        const value = parseWireText(raw);
        if (key.kind === 'ok' && value.kind === 'ok') {
            wire.set(key.value, value.value);
        }
    }
    return wire;
};

export function paneTokensTo(worktrees: Worktrees, answers: CompactRequestQueue, exchange: HandoffExchangeWiring): (pane: string, tokens: TokenMap) => void {
    return (pane, tokens) => {
        worktrees.feed.update(paneId(textOf(pane)), notesOf(tokens));
        answers.onPaneTokens(paneId(textOf(pane)), wireMap(tokens));
        exchange.responder.onPaneTokens(paneId(textOf(pane)), new Map(Object.entries(tokens).map(([name, raw]): [Text, Text] => [must(parseText(name)), must(parseText(raw))])));
    };
}

export function parseEnv(text: string): ReadonlyMap<string, string> {
    return must(parseSettingsFile(text));
}

export function herdrEventsPresence(): Presence {
    return herdrEventsOn() ? 'present' : 'absent';
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
