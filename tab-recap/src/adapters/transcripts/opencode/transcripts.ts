import { existsSync } from 'node:fs';
import { parseMessage } from '@stateforge-labs/harness-adapters/opencode';
import { openOpencodeStore, opencodeDatabasePath } from '@stateforge-labs/harness-adapters/opencode/store';
import type { OpenCodeStore } from '@stateforge-labs/harness-adapters/opencode/store';
import { TranscriptPath, sessionIdOfTranscriptPath } from '@stateforge-labs/harness-adapters';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { Chunk, ChunkResult, Entry, InFlightResult, Located, ObservedResult, Position, PromptResult, SupportedInFlight, Transcripts } from '#src/ports/transcripts.ts';
import { unknown } from '#src/ports/unknowable.ts';
import type { Unknown } from '#src/ports/unknowable.ts';
import { opencodeObserved } from './context.ts';
import { partsOf } from './parts.ts';
import { opencodeInFlight } from './in-flight.ts';

const MESSAGES = 400;
const PROMPT_LOOKBACK = 30;

function newest(entries: readonly Entry[], budget: number): readonly Entry[] {
    let used = 0;
    let from = entries.length;
    while (from > 0 && used + (entries[from - 1]?.text.length ?? 0) <= budget) {
        used += entries[from - 1]?.text.length ?? 0;
        from -= 1;
    }
    return entries.slice(from);
}

const sessionOf = (source: string): string => sessionIdOfTranscriptPath('opencode', source) ?? '';

export class OpencodeTranscripts implements Transcripts {
    readonly agent = 'opencode';
    readonly inFlight: SupportedInFlight = { kind: 'supported', split: { kind: 'foreground-only', why: 'opencode-parts' }, read: (source) => this.readInFlight(source) };
    private readonly database: string;

    constructor(database = opencodeDatabasePath()) {
        this.database = database;
    }

    locate(lane: Lane): Promise<Located> {
        if (lane.cwd === null) {
            return Promise.resolve(unknown({ why: 'not-found', what: `a cwd for ${lane.pane}` }));
        }
        if (!existsSync(this.database)) {
            return Promise.resolve(unknown({ why: 'not-found', what: `opencode's database ${this.database}` }));
        }
        return Promise.resolve(this.withStore((store) => this.newestSession(store, lane.cwd ?? '')));
    }

    read(source: string, was: Position, budget: number): Promise<ChunkResult> {
        return Promise.resolve(this.withStore((store) => this.chunkOf(store, sessionOf(source), was, budget)));
    }

    latestPrompt(source: string): Promise<PromptResult> {
        return Promise.resolve(this.withStore((store) => this.promptOf(store, sessionOf(source))));
    }

    observed(source: string): Promise<ObservedResult> {
        return Promise.resolve(this.withStore((store) => this.observedIn(store, sessionOf(source))));
    }

    private readInFlight(source: string): Promise<InFlightResult> {
        return Promise.resolve(this.withStore((store) => opencodeInFlight(store, sessionOf(source), MESSAGES)));
    }

    private observedIn(store: OpenCodeStore, session: string): ObservedResult {
        for (const message of store.recentMessages(session, PROMPT_LOOKBACK)) {
            const parsed = parseMessage(message.data);
            const found = parsed.ok ? opencodeObserved(parsed.record) : null;
            if (found !== null) {
                return { kind: 'observed', observed: found };
            }
        }
        return { kind: 'observed', observed: null };
    }

    private promptOf(store: OpenCodeStore, session: string): PromptResult {
        for (const message of store.recentMessages(session, PROMPT_LOOKBACK)) {
            const prompt = partsOf(store, message).entries.findLast((entry) => entry.role === 'user');
            if (prompt !== undefined) {
                return { kind: 'prompt', text: prompt.text };
            }
        }
        return { kind: 'prompt', text: null };
    }

    private withStore<T>(use: (store: OpenCodeStore) => T): T | Unknown {
        const store = openOpencodeStore(this.database);
        if (store === null) {
            return unknown({ why: 'unreadable', detail: this.database });
        }
        try {
            return use(store);
        } finally {
            store.close();
        }
    }

    private newestSession(store: OpenCodeStore, cwd: string): Located {
        const session = store.rootSessionForDirectory(cwd);
        return session === null ? unknown({ why: 'not-found', what: `an opencode session in ${cwd}` }) : { kind: 'located', source: `${this.database}${TranscriptPath.OpenCodeSeparator}${session}` };
    }

    private chunkOf(store: OpenCodeStore, session: string, was: Position, budget: number): Chunk {
        const messages = store.messagesSince(session, was.cursor, MESSAGES).toReversed();
        const read = messages.map((message) => partsOf(store, message));
        const entries = newest(read.flatMap((one) => one.entries), budget);
        const prompts = entries.filter((entry) => entry.role === 'user');
        return {
            kind: 'chunk', entries, title: store.sessionTitle(session), lastPrompt: prompts.at(-1)?.text ?? null, claudeRecap: null, notes: read.flatMap((one) => one.notes), marks: read.flatMap((one) => one.marks),
            position: { cursor: Math.max(was.cursor, ...messages.map((message) => message.timeUpdated)), tail: null }, grew: messages.length > 0,
        };
    }
}
