import type { Observed } from '#src/recap/domain/compaction.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { Chunk, ChunkResult, InFlightResult, Located, Mark, ObservedResult, Position, PromptResult, SupportedInFlight, Transcripts } from '#src/ports/transcripts.ts';
import { unknown, type Unknown } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import { causeOf } from '#src/recap/domain/failure-cause.ts';
import { parseText, type Text, textOf } from '#src/recap/domain/text.ts';
import { codexRolloutRoot, findRolloutByCwd, parseCodexToolCall } from '@stateforge-labs/harness-adapters/codex';
import { readJsonl, tailLines, tailOf } from '../jsonl.ts';
import type { Row } from '../jsonl.ts';
import type { ToolCall } from '../tool-calls.ts';
import { codexObservedOf } from './context.ts';
import { CODEX_IN_FLIGHT_INITIAL_BYTES, CODEX_IN_FLIGHT_MAX_BYTES, codexInFlightOf } from './in-flight.ts';
import { codexMarksOf } from './marks.ts';
import { codexCallsOf } from './tool-calls.ts';
import { extractCodexOf } from './transcripts.ts';
import { sourcePathOf, grewOf } from '#src/ports/transcripts.ts';
import { agentKind } from '#src/recap/domain/ids.ts';

const text = (line: string): Text => must(parseText(line));

export function codexObserved(lines: readonly string[]): Observed | null {
    return codexObservedOf(lines.map(text));
}

export function codexInFlight(lines: readonly string[], truncated: boolean): InFlightResult {
    return codexInFlightOf(lines.map(text), truncated ? 'present' : 'absent');
}

export function codexMarks(lines: readonly string[]): readonly Mark[] {
    return codexMarksOf(lines.map(text));
}

export function codexCalls(name: string, raw: unknown, input: Row): readonly ToolCall[] {
    return codexCallsOf(text(name), parseCodexToolCall(name, raw), input);
}

export function extractCodex(lines: readonly string[]): Omit<Chunk, 'kind' | 'position' | 'grew'> {
    return extractCodexOf(lines.map(text));
}

function unreadable(error: unknown): Unknown {
    return unknown({ why: 'unreadable', detail: causeOf(must(parseText(error instanceof Error ? error.message : String(error)))) });
}

export class CodexTranscripts implements Transcripts {
    readonly agent = agentKind('codex');
    readonly inFlight: SupportedInFlight = { kind: 'supported', split: { kind: 'foreground-only', why: 'codex-cells' }, read: (source, budget) => this.readInFlight(source, budget) };
    private readonly root: string;
    private readonly readTail: typeof tailOf;

    constructor(root = codexRolloutRoot(), readTail: typeof tailOf = tailOf) {
        this.root = root;
        this.readTail = readTail;
    }

    locate(lane: Lane): Promise<Located> {
        return Promise.resolve(this.find(lane));
    }

    private readInFlight(source: string, budget: number): Promise<InFlightResult> {
        try {
            let bytes = Math.max(budget, CODEX_IN_FLIGHT_INITIAL_BYTES);
            let tail = this.readTail(source, bytes);
            let answer = codexInFlight(tail.lines, tail.truncated);
            while (tail.truncated && answer.kind === 'unknown' && bytes < CODEX_IN_FLIGHT_MAX_BYTES) {
                bytes = Math.min(bytes * 2, CODEX_IN_FLIGHT_MAX_BYTES);
                tail = this.readTail(source, bytes);
                answer = codexInFlight(tail.lines, tail.truncated);
            }
            return Promise.resolve(answer);
        } catch (error) {
            return Promise.resolve(unreadable(error));
        }
    }

    private find(lane: Lane): Located {
        if (lane.cwd === null) {
            return unknown({ why: 'not-found', what: textOf(`a cwd for ${lane.pane}`) });
        }
        const file = findRolloutByCwd(lane.cwd, { root: this.root });
        return file === null ? unknown({ why: 'not-found', what: textOf(`a codex rollout started in ${lane.cwd}`) }) : { kind: 'located', source: sourcePathOf(file.path) };
    }

    latestPrompt(source: string, budget: number): Promise<PromptResult> {
        try {
            return Promise.resolve({ kind: 'prompt', text: extractCodex(tailLines(source, budget)).lastPrompt });
        } catch (error) {
            return Promise.resolve(unreadable(error));
        }
    }

    observed(source: string, budget: number): Promise<ObservedResult> {
        try {
            return Promise.resolve({ kind: 'observed', observed: codexObserved(tailLines(source, budget)) });
        } catch (error) {
            return Promise.resolve(unreadable(error));
        }
    }

    read(source: string, was: Position, budget: number): Promise<ChunkResult> {
        try {
            const { lines, position, grew, more } = readJsonl(source, was, budget);
            return Promise.resolve({ kind: 'chunk', ...extractCodex(lines), position, grew: grewOf(grew), more: more === 'present' });
        } catch (error) {
            return Promise.resolve(unreadable(error));
        }
    }
}
