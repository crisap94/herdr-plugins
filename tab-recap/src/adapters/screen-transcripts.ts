import { createHash } from 'node:crypto';
import type { Lane } from '#src/recap/domain/lane.ts';
import { cleanScreen, screenEntries, steady } from '#src/recap/application/screen-text.ts';
import { SCREEN_PREFIX } from '#src/ports/screens.ts';
import type { Screens } from '#src/ports/screens.ts';
import type { ChunkResult, Located, Position, PromptResult, Transcripts } from '#src/ports/transcripts.ts';
import { unknown } from '#src/ports/unknowable.ts';

const SCREEN_LINES = 200;

const hashOf = (text: string): string => createHash('sha1').update(text).digest('hex').slice(0, 16);

export class ScreenTranscripts implements Transcripts {
    readonly agent = '*';
    private readonly screens: Screens;
    private readonly wants: (agent: string) => boolean;

    constructor(screens: Screens, wants: (agent: string) => boolean) {
        this.screens = screens;
        this.wants = wants;
    }

    locate(lane: Lane): Promise<Located> {
        const agent = String(lane.agent);
        return Promise.resolve(this.wants(agent)
            ? { kind: 'located', source: `${SCREEN_PREFIX}${lane.pane}` }
            : unknown({ why: 'not-found', what: `a transcript of ${agent} (add it to TAB_RECAP_SCREEN_AGENTS to read its screen)` }));
    }

    latestPrompt(): Promise<PromptResult> {
        return Promise.resolve({ kind: 'prompt', text: null });
    }

    async read(source: string, was: Position, budget: number): Promise<ChunkResult> {
        const shown = await this.screens.readScreen(source.slice(SCREEN_PREFIX.length), SCREEN_LINES);
        if (shown.kind === 'unknown') {
            return shown;
        }
        const clean = cleanScreen(shown.text).slice(-budget);
        const tail = hashOf(steady(clean));
        const grew = tail !== was.tail && clean !== '';
        return {
            kind: 'chunk', entries: grew ? screenEntries(clean) : [], title: null, lastPrompt: null, claudeRecap: null, notes: [],
            position: { cursor: shown.revision, tail }, grew,
        };
    }
}
