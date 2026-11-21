import { statSync } from 'node:fs';
import type { RegisteredKind } from '#src/recap/domain/registered-kinds.ts';
import { type ChunkResult, type InFlightResult, type ObservedResult, type Position, type PromptResult } from '#src/ports/transcripts.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import type { FsPath } from '#src/recap/domain/fs-path.ts';
import { readJsonlFrom, tailSpan } from '../jsonl.ts';
import { claudeObservedOf } from './context.ts';
import { CLAUDE_SPLIT, IN_FLIGHT_MAX_BYTES, answerOf, scanFlight } from './in-flight.ts';
import { extractClaudeOf } from './rows.ts';

export { ClaudeTranscripts, extractClaude } from './legacy.ts';

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
        return { kind: 'chunk', ...extractClaudeOf(lines), position, grew: grew === 'present', more: more === 'present' };
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
