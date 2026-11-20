import { createHash } from 'node:crypto';
import { tuiChrome } from '@stateforge-labs/harness-adapters/tui';
import { must } from '#src/protocol/result.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { cleanScreen, screenEntries, steady } from '#src/recap/application/screen-text.ts';
import type { ScreenChrome } from '#src/recap/application/screen-text.ts';
import { parsePaneId, type AgentKind } from '#src/recap/domain/ids.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { SCREEN_PREFIX } from '#src/ports/screens.ts';
import type { Screens } from '#src/ports/screens.ts';
import type { ChunkResult, InFlightCapability, Located, Position, PromptResult, Transcripts } from '#src/ports/transcripts.ts';
import { unknown } from '#src/ports/unknowable.ts';

const SCREEN_LINES = must(parseCount(200));
export const SCREEN_READER_ID = '*';
export const CLAUDE_SCREEN_CHROME: ScreenChrome = tuiChrome('claude');

export type ScreenWants = (agent: AgentKind) => boolean;

const hashOf = (text: Text): Text => must(parseText(createHash('sha1').update(text).digest('hex').slice(0, 16)));

export class ScreenTranscripts implements Transcripts {
    readonly agent = SCREEN_READER_ID;
    readonly inFlight: InFlightCapability = { kind: 'unsupported', why: 'screen' };
    private readonly screens: Screens;
    private readonly wants: ScreenWants;

    constructor(screens: Screens, wants: ScreenWants) {
        this.screens = screens;
        this.wants = wants;
    }

    locate(lane: Lane): Promise<Located> {
        const agent = lane.agent;
        return Promise.resolve(this.wants(agent)
            ? { kind: 'located', source: `${SCREEN_PREFIX}${lane.pane}` }
            : unknown({ why: 'not-found', what: `a transcript of ${agent} (add it to TAB_RECAP_SCREEN_AGENTS to read its screen)` }));
    }

    latestPrompt(): Promise<PromptResult> {
        return Promise.resolve({ kind: 'prompt', text: null });
    }

    async read(source: string, was: Position, budget: number): Promise<ChunkResult> {
        const shown = await this.screens.readScreen(must(parsePaneId(source.slice(SCREEN_PREFIX.length))), SCREEN_LINES);
        if (shown.kind === 'unknown') {
            return shown;
        }
        const clean = cleanScreen(shown.text, CLAUDE_SCREEN_CHROME).slice(-budget);
        const tail = hashOf(must(parseText(steady(clean))));
        const grew = tail !== was.tail && clean !== '';
        return {
            kind: 'chunk', entries: grew ? screenEntries(clean, CLAUDE_SCREEN_CHROME) : [], title: null, lastPrompt: null, claudeRecap: null, notes: [],
            position: { cursor: shown.revision, tail }, grew,
        };
    }
}
