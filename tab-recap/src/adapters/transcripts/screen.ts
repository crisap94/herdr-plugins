import { createHash } from 'node:crypto';
import { tuiChrome } from '@stateforge-labs/harness-adapters/tui';
import { must } from '@stateforge-labs/session-ledger';
import { parseCount } from '@stateforge-labs/session-ledger';
import { cleanScreen, screenEntries, steady } from '#src/recap/application/screen-text.ts';
import type { ScreenChrome } from '#src/recap/application/screen-text.ts';
import { parsePaneId, type HarnessKind, parseAgentKind } from '#src/recap/domain/ids.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import type { LegacyFollowedSession } from '@stateforge-labs/session-ledger';
import { parseText, type Text, textOf } from '@stateforge-labs/session-ledger';
import { SCREEN_PREFIX } from '#src/ports/screens.ts';
import type { ScreenReader } from '#src/ports/screens.ts';
import type { ChunkResult, InFlightCapability, Located, Position, PromptResult } from '@stateforge-labs/session-ledger';
import type { LegacySessionReader as SessionReader } from '@stateforge-labs/session-ledger';
import { unknown } from '@stateforge-labs/session-ledger';
import { sourcePathOf, cursorOf, grewOf } from '@stateforge-labs/session-ledger';

const SCREEN_LINES = must(parseCount(200));
export const SCREEN_READER_ID = '*';
export const CLAUDE_SCREEN_CHROME: ScreenChrome = tuiChrome('claude');

export type ScreenWants = (agent: HarnessKind) => Presence;

const hashOf = (text: Text): Text => must(parseText(createHash('sha1').update(text).digest('hex').slice(0, 16)));

export class ScreenTranscripts implements SessionReader {
    readonly agent = must(parseAgentKind(SCREEN_READER_ID));
    readonly inFlight: InFlightCapability = { kind: 'unsupported', why: 'screen' };
    private readonly screens: ScreenReader;
    private readonly wants: ScreenWants;

    constructor(screens: ScreenReader, wants: ScreenWants) {
        this.screens = screens;
        this.wants = wants;
    }

    locate(lane: LegacyFollowedSession): Promise<Located> {
        const agent = lane.agent;
        return Promise.resolve(this.wants(agent) === 'present'
            ? { kind: 'located', source: sourcePathOf(`${SCREEN_PREFIX}${lane.key}`) }
            : unknown({ why: 'not-found', what: textOf(`a transcript of ${agent} (add it to TAB_RECAP_SCREEN_AGENTS to read its screen)`) }));
    }

    latestPrompt(): Promise<PromptResult> {
        return Promise.resolve({ kind: 'prompt', text: null });
    }

    async read(source: string, was: Position, budget: number): Promise<ChunkResult> {
        const shown = await this.screens.readScreen(must(parsePaneId(source.slice(SCREEN_PREFIX.length))), SCREEN_LINES);
        if (shown.kind === 'unknown') {
            return shown;
        }
        const clean = textOf(cleanScreen(textOf(shown.text), CLAUDE_SCREEN_CHROME).slice(-budget));
        const tail = hashOf(must(parseText(steady(clean))));
        const grew = tail !== was.tail && clean !== '';
        return {
            kind: 'chunk', entries: grew ? screenEntries(clean, CLAUDE_SCREEN_CHROME) : [], title: null, lastPrompt: null, harnessRecap: null, notes: [],
            position: { cursor: cursorOf(shown.revision), tail }, grew: grewOf(grew),
        };
    }
}
