import { CodexItemType, isInjectedContext, parseCodexToolCall, readRollout } from '@stateforge-labs/harness-adapters/codex';
import type { CodexRow } from '@stateforge-labs/harness-adapters/codex';
import type { Chunk, Entry } from '#src/ports/transcripts.ts';
import { must } from '#src/protocol/result.ts';
import { parseInstant, type Instant } from '#src/recap/domain/time.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { arr, obj, parse, str } from '../jsonl.ts';
import type { Row } from '../jsonl.ts';
import { toolEntry } from '../tool-calls.ts';
import { marksOf } from './marks.ts';
import { codexCallsOf } from './tool-calls.ts';

export { CodexTranscripts, extractCodex } from './legacy.ts';

function instantOf(row: CodexRow): Instant | undefined {
    const parsed = parseInstant(row.at);
    return parsed.kind === 'ok' ? parsed.value : undefined;
}

function messageEntry(payload: Row, at: Instant | undefined): Entry | null {
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

function toolEntries(payload: Row, at: Instant | undefined): readonly Entry[] {
    const raw = payload['arguments'] ?? payload['input'];
    const input = typeof raw === 'string' ? (parse(raw) ?? {}) : obj(raw);
    const name = must(parseText(str(payload['name']) ?? 'tool'));
    return codexCallsOf(name, parseCodexToolCall(name, raw), input).map((call) => toolEntry(call, at));
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
    return { entries, notes: [], marks: marksOf(rows), title: null, lastPrompt: entries.findLast((entry) => entry.role === 'user')?.text ?? null, claudeRecap: null };
}
