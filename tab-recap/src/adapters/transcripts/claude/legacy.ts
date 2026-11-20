import { claudeProjectsRoot, locateClaudeTranscript } from '@stateforge-labs/harness-adapters/claude';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { Observed } from '#src/recap/domain/compaction.ts';
import type { Chunk } from '#src/ports/transcripts.ts';
import { UNREAD, type BackgroundSplit, type ChunkResult, type InFlightResult, type Located, type ObservedResult, type Position, type PromptResult, type SupportedInFlight, type Transcripts } from '#src/ports/transcripts.ts';
import { unknown, type Unknown } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import { causeOf } from '#src/recap/domain/failure-cause.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { parseFsPath } from '#src/recap/domain/fs-path.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { sameStart } from '../jsonl.ts';
import { claudeObservedOf } from './context.ts';
import { CLAUDE_SPLIT, claudeInFlightOf } from './in-flight.ts';
import { extractClaudeOf } from './rows.ts';
import { CLAUDE_KIND, ClaudeReader } from './transcripts.ts';

const text = (line: string): Text => must(parseText(line));

export function claudeObserved(lines: readonly string[]): Observed | null {
    return claudeObservedOf(lines.map(text));
}

export function claudeInFlight(lines: readonly string[], truncated = false, split: BackgroundSplit = CLAUDE_SPLIT): InFlightResult {
    return claudeInFlightOf(lines.map(text), truncated ? 'present' : 'absent', split);
}

export function extractClaude(lines: readonly string[]): Omit<Chunk, 'kind' | 'position' | 'grew'> {
    return extractClaudeOf(lines.map(text));
}

function unreadable(error: unknown): Unknown {
    return unknown({ why: 'unreadable', detail: causeOf(must(parseText(error instanceof Error ? error.message : String(error)))) });
}

export class ClaudeTranscripts implements Transcripts {
    readonly agent = CLAUDE_KIND;
    private readonly root: string;
    private readonly reader = new ClaudeReader();
    readonly inFlight: SupportedInFlight = { kind: 'supported', split: CLAUDE_SPLIT, read: (source, budget) => this.readInFlight(source, budget) };

    constructor(root = claudeProjectsRoot()) {
        this.root = root;
    }

    locate(lane: Lane): Promise<Located> {
        return Promise.resolve(this.find(lane));
    }

    private find(lane: Lane): Located {
        if (lane.session === null) {
            return unknown({ why: 'not-found', what: `a session id for ${lane.pane}` });
        }
        const found = locateClaudeTranscript(lane.session, this.root);
        return found === null ? unknown({ why: 'not-found', what: `the transcript of ${lane.session}` }) : { kind: 'located', source: found.path };
    }

    latestPrompt(source: string, budget: number): Promise<PromptResult> {
        try {
            return Promise.resolve(this.reader.latestPrompt(must(parseFsPath(source)), must(parseCount(budget))));
        } catch (error) {
            return Promise.resolve(unreadable(error));
        }
    }

    observed(source: string, budget: number): Promise<ObservedResult> {
        try {
            return Promise.resolve(this.reader.observed(must(parseFsPath(source)), must(parseCount(budget))));
        } catch (error) {
            return Promise.resolve(unreadable(error));
        }
    }

    private readInFlight(source: string, budget: number): Promise<InFlightResult> {
        try {
            return Promise.resolve(this.reader.inFlight(must(parseFsPath(source)), must(parseCount(budget))));
        } catch (error) {
            return Promise.resolve(unreadable(error));
        }
    }

    read(source: string, was: Position, budget: number): Promise<ChunkResult> {
        try {
            return Promise.resolve(this.reader.read(must(parseFsPath(source)), was, must(parseCount(budget))));
        } catch (error) {
            return Promise.resolve(unreadable(error));
        }
    }

    carry(from: Located, to: Located, at: Position): Promise<Position> {
        if (from.kind !== 'located' || to.kind !== 'located') return Promise.resolve(UNREAD);
        const [was, now, cursor] = [parseFsPath(from.source), parseFsPath(to.source), parseCount(at.cursor)];
        if (was.kind !== 'ok' || now.kind !== 'ok' || cursor.kind !== 'ok') return Promise.resolve(UNREAD);
        return Promise.resolve(sameStart(was.value, now.value, cursor.value) === 'present' ? at : UNREAD);
    }
}
