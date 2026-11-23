import type { Waiting } from '#src/recap/application/autocompact.ts';
import { awaitingPane } from './autocompact.ts';
import { must } from '#src/protocol/result.ts';
import { paneId } from '#src/recap/domain/ids.ts';
import { duration, type Duration } from '#src/recap/domain/time.ts';
import { parseText, textOf, type Text } from '#src/recap/domain/text.ts';
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

export function parseEnv(text: string): ReadonlyMap<string, string> {
    return must(parseSettingsFile(text));
}
