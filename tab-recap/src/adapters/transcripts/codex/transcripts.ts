import { CodexItemType, codexRolloutRoot, findRolloutByCwd, isInjectedContext, readRollout } from '@stateforge-labs/harness-adapters/codex';
import type { CodexRow } from '@stateforge-labs/harness-adapters/codex';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { Chunk, ChunkResult, Entry, InFlightResult, Located, ObservedResult, Position, PromptResult, SupportedInFlight, Transcripts } from '#src/ports/transcripts.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { arr, obj, parse, readJsonl, str, tailLines, tailOf } from '../jsonl.ts';
import type { Row } from '../jsonl.ts';
import { CODEX_IN_FLIGHT_INITIAL_BYTES, CODEX_IN_FLIGHT_MAX_BYTES, codexInFlight } from './in-flight.ts';
import { marksOf } from './marks.ts';
import { codexObserved } from './context.ts';
import { codexCalls } from './tool-calls.ts';
import { toolEntry } from '../tool-calls.ts';

function messageEntry(payload: Row, at: number | undefined): Entry | null {
    const role = str(payload['role']);
    if (role !== 'user' && role !== 'assistant') {
        return null;
    }
    const text = arr(payload['content']).map((part) => str(part['text']) ?? '').join('\n');
    if (text === '' || isInjectedContext(text)) {
        return null;
    }
    return { role: role === 'user' ? 'user' : 'agent', text, ...(at === undefined ? {} : { at }) };
}

function toolEntries(payload: Row, at: number | undefined): readonly Entry[] {
    const raw = payload['arguments'] ?? payload['input'];
    const input = typeof raw === 'string' ? (parse(raw) ?? {}) : obj(raw);
    return codexCalls(str(payload['name']) ?? 'tool', raw, input).map((call) => toolEntry(call, at));
}

function entriesOf(row: CodexRow): readonly Entry[] {
    if (row.kind !== 'response_item') {
        return [];
    }
    const at = row.at ?? undefined;
    if (row.item === CodexItemType.enum.message) {
        const entry = messageEntry(row.payload, at);
        return entry === null ? [] : [entry];
    }
    return row.item === CodexItemType.enum.function_call || row.item === CodexItemType.enum.custom_tool_call ? toolEntries(row.payload, at) : [];
}

export function extractCodex(lines: readonly string[]): Omit<Chunk, 'kind' | 'position' | 'grew'> {
    const rows = readRollout(lines).rows;
    const entries = rows.flatMap((row) => entriesOf(row));
    return { entries, notes: [], marks: marksOf(rows), title: null, lastPrompt: entries.findLast((entry) => entry.role === 'user')?.text ?? null, claudeRecap: null };
}

export class CodexTranscripts implements Transcripts {
    readonly agent = 'codex';
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
            return Promise.resolve(unknown({ why: 'unreadable', detail: error instanceof Error ? error.message : String(error) }));
        }
    }

    private find(lane: Lane): Located {
        if (lane.cwd === null) {
            return unknown({ why: 'not-found', what: `a cwd for ${lane.pane}` });
        }
        const file = findRolloutByCwd(lane.cwd, { root: this.root });
        return file === null ? unknown({ why: 'not-found', what: `a codex rollout started in ${lane.cwd}` }) : { kind: 'located', source: file.path };
    }

    latestPrompt(source: string, budget: number): Promise<PromptResult> {
        try {
            return Promise.resolve({ kind: 'prompt', text: extractCodex(tailLines(source, budget)).lastPrompt });
        } catch (error) {
            return Promise.resolve(unknown({ why: 'unreadable', detail: error instanceof Error ? error.message : String(error) }));
        }
    }

    observed(source: string, budget: number): Promise<ObservedResult> {
        try {
            return Promise.resolve({ kind: 'observed', observed: codexObserved(tailLines(source, budget)) });
        } catch (error) {
            return Promise.resolve(unknown({ why: 'unreadable', detail: error instanceof Error ? error.message : String(error) }));
        }
    }

    read(source: string, was: Position, budget: number): Promise<ChunkResult> {
        try {
            const { lines, position, grew } = readJsonl(source, was, budget);
            return Promise.resolve({ kind: 'chunk', ...extractCodex(lines), position, grew });
        } catch (error) {
            return Promise.resolve(unknown({ why: 'unreadable', detail: error instanceof Error ? error.message : String(error) }));
        }
    }
}
