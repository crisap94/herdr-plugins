import { existsSync } from 'node:fs';
import { parseMessage } from '@stateforge-labs/harness-adapters/opencode';
import { openOpencodeStore, opencodeDatabasePath } from '@stateforge-labs/harness-adapters/opencode/store';
import type { OpenCodeStore } from '@stateforge-labs/harness-adapters/opencode/store';
import { TranscriptPath, sessionIdOfTranscriptPath } from '@stateforge-labs/harness-adapters';
import type { Directory } from '#src/recap/domain/directory.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { parseFsPath, type FsPath } from '#src/recap/domain/fs-path.ts';
import type { Chunk, ChunkResult, Entry, InFlightResult, Located, ObservedResult, Position, PromptResult, SupportedInFlight, Transcripts } from '#src/ports/transcripts.ts';
import { unknown } from '#src/ports/unknowable.ts';
import type { Unknown } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import { causeOf } from '#src/recap/domain/failure-cause.ts';
import { parseText, type Text, textOf } from '#src/recap/domain/text.ts';
import { opencodeObserved } from './context.ts';
import { partsOf } from './parts.ts';
import { opencodeInFlight } from './in-flight.ts';
import { sourcePathOf, cursorOf, grewOf } from '#src/ports/transcripts.ts';
import { agentKind } from '#src/recap/domain/ids.ts';

export { OpencodeTranscripts } from './legacy.ts';

const MESSAGES = must(parseCount(400));
const PROMPT_LOOKBACK = 30;

function newest(entries: readonly Entry[], budget: Count): readonly Entry[] {
    let used = 0;
    let from = entries.length;
    while (from > 0 && used + (entries[from - 1]?.text.length ?? 0) <= budget) {
        used += entries[from - 1]?.text.length ?? 0;
        from -= 1;
    }
    return entries.slice(from);
}

const sessionOf = (source: Text): Text => must(parseText(sessionIdOfTranscriptPath('opencode', source) ?? ''));

export class OpencodeReader implements Transcripts {
    readonly agent = agentKind('opencode');
    readonly inFlight: SupportedInFlight = { kind: 'supported', split: { kind: 'foreground-only', why: 'opencode-parts' }, read: (source) => this.readInFlight(must(parseText(source))) };
    private readonly database: FsPath;

    constructor(database: FsPath = must(parseFsPath(opencodeDatabasePath()))) {
        this.database = database;
    }

    locate(lane: Lane): Promise<Located> {
        const cwd = lane.cwd;
        if (cwd === null) {
            return Promise.resolve(unknown({ why: 'not-found', what: `a cwd for ${lane.pane}` }));
        }
        if (!existsSync(this.database)) {
            return Promise.resolve(unknown({ why: 'not-found', what: `opencode's database ${this.database}` }));
        }
        return Promise.resolve(this.withStore((store) => this.newestSession(store, cwd)));
    }

    read(source: string, was: Position, budget: number): Promise<ChunkResult> {
        return Promise.resolve(this.withStore((store) => this.chunkOf(store, sessionOf(must(parseText(source))), was, must(parseCount(budget)))));
    }

    latestPrompt(source: string): Promise<PromptResult> {
        return Promise.resolve(this.withStore((store) => this.promptOf(store, sessionOf(must(parseText(source))))));
    }

    observed(source: string): Promise<ObservedResult> {
        return Promise.resolve(this.withStore((store) => this.observedIn(store, sessionOf(must(parseText(source))))));
    }

    private readInFlight(source: Text): Promise<InFlightResult> {
        return Promise.resolve(this.withStore((store) => opencodeInFlight(store, sessionOf(source), MESSAGES)));
    }

    private observedIn(store: OpenCodeStore, session: Text): ObservedResult {
        for (const message of store.recentMessages(session, PROMPT_LOOKBACK)) {
            const parsed = parseMessage(message.data);
            const found = parsed.ok ? opencodeObserved(parsed.record) : null;
            if (found !== null) {
                return { kind: 'observed', observed: found };
            }
        }
        return { kind: 'observed', observed: null };
    }

    private promptOf(store: OpenCodeStore, session: Text): PromptResult {
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
            return unknown({ why: 'unreadable', detail: causeOf(must(parseText(this.database))) });
        }
        try {
            return use(store);
        } finally {
            store.close();
        }
    }

    private newestSession(store: OpenCodeStore, cwd: Directory): Located {
        const session = store.rootSessionForDirectory(cwd);
        return session === null ? unknown({ why: 'not-found', what: `an opencode session in ${cwd}` }) : { kind: 'located', source: sourcePathOf(`${this.database}${TranscriptPath.OpenCodeSeparator}${session}`) };
    }

    private chunkOf(store: OpenCodeStore, session: Text, was: Position, budget: Count): Chunk {
        const messages = store.messagesSince(session, was.cursor, MESSAGES).toReversed();
        const read = messages.map((message) => partsOf(store, message));
        const entries = newest(read.flatMap((one) => one.entries), budget);
        const prompts = entries.filter((entry) => entry.role === 'user');
        const title = store.sessionTitle(session);
        return {
            kind: 'chunk', entries, title: title === null ? null : textOf(title), lastPrompt: prompts.at(-1)?.text ?? null, claudeRecap: null, notes: read.flatMap((one) => one.notes), marks: read.flatMap((one) => one.marks),
            position: { cursor: cursorOf(Math.max(was.cursor, ...messages.map((message) => message.timeUpdated))), tail: null }, grew: grewOf(messages.length > 0),
        };
    }
}
