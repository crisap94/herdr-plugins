import type { Waiting } from '#src/recap/application/autocompact.ts';
import { awaitingPane } from './autocompact.ts';
import { must } from '#src/protocol/result.ts';
import type { TokenMap } from '#src/protocol/tokens.ts';
import type { CompactRequestQueue } from '#src/recap/application/compact-requests.ts';
import { parseWireText, type WireText } from '#src/protocol/primitives.ts';
import { notesOf } from '#src/recap/domain/coordination.ts';
import { paneId } from '#src/recap/domain/ids.ts';
import { duration, type Duration } from '#src/recap/domain/time.ts';
import { parseText, textOf, type Text } from '#src/recap/domain/text.ts';
import type { HandoffExchangeWiring } from './handoff-exchange-wiring.ts';
import type { Worktrees } from './worktrees.ts';
import { parseSettingsFile } from './config.ts';

export function logVia(write: (line: Text) => void): (line: string) => void {
    return (line) => { write(must(parseText(line))); };
}

export function pauseVia(pause: (span: Duration) => Promise<void>): (ms: number) => Promise<void> {
    return (ms) => pause(duration(ms));
}

export function awaitingNow(pane: string): Promise<Waiting> {
    return awaitingPane(paneId(textOf(pane)));
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
        const text = new Map(Object.entries(tokens).map(([name, raw]): [Text, Text] => [must(parseText(name)), must(parseText(raw))]));
        worktrees.feed.update(paneId(textOf(pane)), notesOf(text));
        answers.onPaneTokens(paneId(textOf(pane)), wireMap(tokens));
        exchange.responder.onPaneTokens(paneId(textOf(pane)), text);
    };
}

export function parseEnv(text: string): ReadonlyMap<string, string> {
    return must(parseSettingsFile(text));
}
