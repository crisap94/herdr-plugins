import { must } from '@stateforge-labs/session-ledger';
import { CodexItemType, codexRolloutRoot, findRolloutByCwd, isInjectedContext, parseCodexToolCall, readRollout } from '@stateforge-labs/harness-adapters/codex';
import type { CodexRow } from '@stateforge-labs/harness-adapters/codex';
import { sourcePathOf, grewOf, type Chunk, type ChunkResult, type Entry, type InFlightResult, type Located, type ObservedResult, type Position, type PromptResult, type SourcePath } from '@stateforge-labs/session-ledger';
import { type LegacySessionReader as SessionReader } from '@stateforge-labs/session-ledger';
import { unknown } from '@stateforge-labs/session-ledger';
import type { Lane } from '#src/recap/domain/lane.ts';
import { parseAgentKind } from '#src/recap/domain/ids.ts';
import { countOf, type Count } from '@stateforge-labs/session-ledger';
import { fsPathOf, type FsPath } from '#src/recap/domain/fs-path.ts';
import { parseInstant, type Instant } from '@stateforge-labs/session-ledger';
import { type Text, textOf } from '@stateforge-labs/session-ledger';
import { parseFilledTextOrNull, parseLine, readJsonlFrom, parseRowOrEmpty, parseRowsOrEmpty, tailSpan, parseUnreadable, type SupportedReading } from '../jsonl.ts';
import type { Row } from '../jsonl.ts';
import { toolEntryOf } from '../tool-calls.ts';
import { codexObservedOf } from './context.ts';
import { CODEX_IN_FLIGHT_INITIAL_BYTES, CODEX_IN_FLIGHT_MAX_BYTES, codexInFlightOf } from './in-flight.ts';
import { marksOf } from './marks.ts';
import { codexCallsOf } from './tool-calls.ts';

function instantOf(row: CodexRow): Instant | undefined {
    const parsed = parseInstant(row.at);
    return parsed.kind === 'ok' ? parsed.value : undefined;
}

function messageEntry(payload: Row, at: Instant | undefined): Entry | null {
    const role = parseFilledTextOrNull(payload['role']);
    if (role !== 'user' && role !== 'assistant') {
        return null;
    }
    const text = parseRowsOrEmpty(payload['content']).map((part) => parseFilledTextOrNull(part['text']) ?? '').join('\n');
    if (text === '' || isInjectedContext(text)) {
        return null;
    }
    return { role: role === 'user' ? 'user' : 'agent', text: textOf(text), ...(at === undefined ? {} : { at }) };
}

function toolEntries(payload: Row, at: Instant | undefined): readonly Entry[] {
    const raw = payload['arguments'] ?? payload['input'];
    const input = typeof raw === 'string' ? (parseLine(textOf(raw)) ?? {}) : parseRowOrEmpty(raw);
    const name = textOf(parseFilledTextOrNull(payload['name']) ?? 'tool');
    return codexCallsOf(name, parseCodexToolCall(name, raw), input).map((call) => toolEntryOf(call, at ?? null));
}

function entriesOf(row: CodexRow): readonly Entry[] {
    if (row.kind !== 'response_item') {
        return [];
    }
    const at = instantOf(row);
    if (row.item === CodexItemType.enum.message) {
        const entry = messageEntry(row.payload, at);
        return entry === null ? [] : [entry];
    }
    return row.item === CodexItemType.enum.function_call || row.item === CodexItemType.enum.custom_tool_call ? toolEntries(row.payload, at) : [];
}

export function extractCodexOf(lines: readonly Text[]): Omit<Chunk, 'kind' | 'position' | 'grew'> {
    const rows = readRollout(lines).rows;
    const entries = rows.flatMap((row) => entriesOf(row));
    return { entries, notes: [], marks: marksOf(rows), title: null, lastPrompt: entries.findLast((entry) => entry.role === 'user')?.text ?? null, harnessRecap: null };
}

export class CodexTranscripts implements SessionReader {
    readonly agent = must(parseAgentKind('codex'));
    readonly inFlight: SupportedReading = { kind: 'supported', split: { kind: 'foreground-only', why: 'codex-cells' }, read: (source, budget) => this.readInFlight(source, budget) };
    private readonly root: FsPath;
    private readonly readTail: typeof tailSpan;

    constructor(root: FsPath = fsPathOf(codexRolloutRoot()), readTail: typeof tailSpan = tailSpan) {
        this.root = root;
        this.readTail = readTail;
    }

    locate(lane: Lane): Promise<Located> {
        return Promise.resolve(this.find(lane));
    }

    private readInFlight(source: SourcePath, budget: Count): Promise<InFlightResult> {
        try {
            const path = fsPathOf(source);
            let bytes = countOf(Math.max(budget, CODEX_IN_FLIGHT_INITIAL_BYTES));
            let tail = this.readTail(path, bytes);
            let answer = codexInFlightOf(tail.lines, tail.truncated);
            while (tail.truncated === 'present' && answer.kind === 'unknown' && bytes < CODEX_IN_FLIGHT_MAX_BYTES) {
                bytes = countOf(Math.min(bytes * 2, CODEX_IN_FLIGHT_MAX_BYTES));
                tail = this.readTail(path, bytes);
                answer = codexInFlightOf(tail.lines, tail.truncated);
            }
            return Promise.resolve(answer);
        } catch (error) {
            return Promise.resolve(parseUnreadable(error));
        }
    }

    private find(lane: Lane): Located {
        if (lane.cwd === null) {
            return unknown({ why: 'not-found', what: textOf(`a cwd for ${lane.pane}`) });
        }
        const file = findRolloutByCwd(lane.cwd, { root: this.root });
        return file === null ? unknown({ why: 'not-found', what: textOf(`a codex rollout started in ${lane.cwd}`) }) : { kind: 'located', source: sourcePathOf(file.path) };
    }

    latestPrompt(source: SourcePath, budget: Count): Promise<PromptResult> {
        try {
            return Promise.resolve({ kind: 'prompt', text: extractCodexOf(tailSpan(fsPathOf(source), budget).lines).lastPrompt });
        } catch (error) {
            return Promise.resolve(parseUnreadable(error));
        }
    }

    observed(source: SourcePath, budget: Count): Promise<ObservedResult> {
        try {
            return Promise.resolve({ kind: 'observed', observed: codexObservedOf(tailSpan(fsPathOf(source), budget).lines) });
        } catch (error) {
            return Promise.resolve(parseUnreadable(error));
        }
    }

    read(source: SourcePath, was: Position, budget: Count): Promise<ChunkResult> {
        try {
            const { lines, position, grew, more } = readJsonlFrom(fsPathOf(source), was, budget);
            return Promise.resolve({ kind: 'chunk', ...extractCodexOf(lines), position, grew: grewOf(grew === 'present'), more: more === 'present' });
        } catch (error) {
            return Promise.resolve(parseUnreadable(error));
        }
    }
}
