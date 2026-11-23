import { statSync } from 'node:fs';
import { claudeProjectsRoot, locateClaudeTranscript } from '@stateforge-labs/harness-adapters/claude';
import type { RegisteredKind } from '#src/recap/domain/registered-kinds.ts';
import { UNREAD, type ChunkResult, type InFlightResult, type Located, type ObservedResult, type Position, type PromptResult, type SourcePath, type Transcripts, grewOf, sourcePathOf } from '#src/ports/transcripts.ts';
import { isUnknown, unknown } from '#src/ports/unknowable.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { parseAgentKind } from '#src/recap/domain/ids.ts';
import { textOf } from '#src/recap/domain/text.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { fsPathOf, parseFsPath, type FsPath } from '#src/recap/domain/fs-path.ts';
import { readJsonlFrom, sameStart, tailSpan, parseUnreadable, type SupportedReading } from '../jsonl.ts';
import { claudeObservedOf } from './context.ts';
import { CLAUDE_SPLIT, IN_FLIGHT_MAX_BYTES, answerOf, scanFlight } from './in-flight.ts';
import { extractClaudeOf } from './rows.ts';

export const CLAUDE_KIND = 'claude' satisfies RegisteredKind;

export const KEPT_UNKNOWN_MAX = 256;

export interface KeptUnknown {
    readonly size: Count;
    readonly answer: InFlightResult;
}

function answerAt(path: FsPath, budget: Count): InFlightResult {
    let bytes: number = budget;
    let tail = tailSpan(path, budget);
    let scan = scanFlight(tail.lines);
    while (tail.truncated === 'present' && scan?.unseen === 'present' && bytes < IN_FLIGHT_MAX_BYTES) {
        bytes = Math.min(bytes * 2, IN_FLIGHT_MAX_BYTES);
        tail = tailSpan(path, must(parseCount(bytes)));
        scan = scanFlight(tail.lines);
    }
    return answerOf(scan, tail.truncated, CLAUDE_SPLIT);
}

export class ClaudeReader {
    private readonly unknownAt = new Map<FsPath, KeptUnknown>();

    latestPrompt(path: FsPath, budget: Count): PromptResult {
        const found = extractClaudeOf(tailSpan(path, budget).lines);
        return { kind: 'prompt', text: found.entries.findLast((entry) => entry.role === 'user')?.text ?? found.lastPrompt };
    }

    observed(path: FsPath, budget: Count): ObservedResult {
        return { kind: 'observed', observed: claudeObservedOf(tailSpan(path, budget).lines) };
    }

    read(path: FsPath, was: Position, budget: Count): ChunkResult {
        const { lines, position, grew, more } = readJsonlFrom(path, was, budget);
        return { kind: 'chunk', ...extractClaudeOf(lines), position, grew: grewOf(grew === 'present'), more: more === 'present' };
    }

    inFlight(path: FsPath, budget: Count): InFlightResult {
        const size = must(parseCount(statSync(path).size));
        const kept = this.unknownAt.get(path);
        if (kept !== undefined && kept.size === size) return kept.answer;
        const answer = answerAt(path, budget);
        if (isUnknown(answer)) this.keep(path, { size, answer });
        else this.unknownAt.delete(path);
        return answer;
    }

    private keep(path: FsPath, kept: KeptUnknown): void {
        this.unknownAt.delete(path);
        this.unknownAt.set(path, kept);
        for (const oldest of this.unknownAt.keys()) {
            if (this.unknownAt.size <= KEPT_UNKNOWN_MAX) break;
            this.unknownAt.delete(oldest);
        }
    }
}

export class ClaudeTranscripts implements Transcripts {
    readonly agent = must(parseAgentKind(CLAUDE_KIND));
    private readonly root: FsPath;
    private readonly reader = new ClaudeReader();
    readonly inFlight: SupportedReading = { kind: 'supported', split: CLAUDE_SPLIT, read: (source, budget) => this.readInFlight(source, budget) };

    constructor(root: FsPath = fsPathOf(claudeProjectsRoot())) {
        this.root = root;
    }

    locate(lane: Lane): Promise<Located> {
        return Promise.resolve(this.find(lane));
    }

    private find(lane: Lane): Located {
        if (lane.session === null) {
            return unknown({ why: 'not-found', what: textOf(`a session id for ${lane.pane}`) });
        }
        const found = locateClaudeTranscript(lane.session, this.root);
        return found === null ? unknown({ why: 'not-found', what: textOf(`the transcript of ${lane.session}`) }) : { kind: 'located', source: sourcePathOf(found.path) };
    }

    latestPrompt(source: SourcePath, budget: Count): Promise<PromptResult> {
        try {
            return Promise.resolve(this.reader.latestPrompt(fsPathOf(source), budget));
        } catch (error) {
            return Promise.resolve(parseUnreadable(error));
        }
    }

    observed(source: SourcePath, budget: Count): Promise<ObservedResult> {
        try {
            return Promise.resolve(this.reader.observed(fsPathOf(source), budget));
        } catch (error) {
            return Promise.resolve(parseUnreadable(error));
        }
    }

    private readInFlight(source: SourcePath, budget: Count): Promise<InFlightResult> {
        try {
            return Promise.resolve(this.reader.inFlight(fsPathOf(source), budget));
        } catch (error) {
            return Promise.resolve(parseUnreadable(error));
        }
    }

    read(source: SourcePath, was: Position, budget: Count): Promise<ChunkResult> {
        try {
            return Promise.resolve(this.reader.read(fsPathOf(source), was, budget));
        } catch (error) {
            return Promise.resolve(parseUnreadable(error));
        }
    }

    carry(from: Located, to: Located, at: Position): Promise<Position> {
        if (from.kind !== 'located' || to.kind !== 'located') return Promise.resolve(UNREAD);
        const [was, now, cursor] = [parseFsPath(from.source), parseFsPath(to.source), parseCount(at.cursor)];
        if (was.kind !== 'ok' || now.kind !== 'ok' || cursor.kind !== 'ok') return Promise.resolve(UNREAD);
        return Promise.resolve(sameStart(was.value, now.value, cursor.value) === 'present' ? at : UNREAD);
    }
}
