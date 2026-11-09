import type { ClaudeCompact, ClaudeRecord } from '@stateforge-labs/harness-adapters/claude';
import * as claude from '@stateforge-labs/harness-adapters/claude';
import type { AgentNote, Chunk, Entry, Mark } from '#src/ports/transcripts.ts';
import { namedCall, toolEntry } from '../tool-calls.ts';

const AWAY_SUBTYPE = claude.ClaudeSystemSubtype.enum['away_summary'];

interface Meta {
    title: string | null;
    lastPrompt: string | null;
    claudeRecap: string | null;
}

function awayOf(record: ClaudeRecord): string | null {
    return record.kind === 'system' && record.subtype === AWAY_SUBTYPE ? record.content : null;
}

function compactRecapOf(record: ClaudeRecord): string | null {
    if (record.kind !== 'user' || !record['isCompactSummary']) {
        return null;
    }
    const text = record.text.trim();
    return text === '' ? null : text;
}

function compactedMark(record: ClaudeRecord, compact: ClaudeCompact): Mark {
    return {
        kind: 'compacted',
        at: record.at,
        ...(compact.preTokens === null ? {} : { tokensBefore: compact.preTokens }),
        ...(compact.postTokens === null ? {} : { tokensAfter: compact.postTokens }),
        ...(compact.durationMs === null ? {} : { tookMs: compact.durationMs }),
        ...(compact.trigger === null ? {} : { trigger: compact.trigger }),
    };
}

function noteMeta(record: ClaudeRecord, meta: Meta): void {
    if (record.kind === 'ai-title' && record.title !== '') {
        meta.title = record.title;
    }
    if (record.kind === 'last-prompt' && record.prompt !== '') {
        meta.lastPrompt = claude.unwrapPastedContent(record.prompt);
    }
    meta.claudeRecap = awayOf(record) ?? meta.claudeRecap;
}

function agentEntries(record: ClaudeRecord): Entry[] {
    if (record.kind !== 'assistant' || record.sidechain) {
        return [];
    }
    const entries: Entry[] = [];
    const at = record.at === null ? {} : { at: record.at };
    for (const block of record.blocks) {
        if (block.kind === 'text' && block.text.trim() !== '') {
            entries.push({ role: 'agent', text: block.text, ...at });
        } else if (block.kind === 'tool_use') {
            entries.push(toolEntry(namedCall('claude', block.name, block.input), record.at ?? undefined));
        }
    }
    return entries;
}

function entriesOf(record: ClaudeRecord): Entry[] {
    const prompt = claude.humanPrompt(record);
    const at = record.at === null ? {} : { at: record.at };
    const user: Entry[] = prompt === null ? [] : [{ role: 'user', text: prompt, ...at, ...(record.kind === 'attachment' ? { queued: true } : {}) }];
    return [...user, ...agentEntries(record)];
}

function notesOf(record: ClaudeRecord): AgentNote[] {
    const notes: AgentNote[] = [];
    const away = awayOf(record);
    const compacted = compactRecapOf(record);
    if (away !== null) {
        notes.push({ kind: 'away_summary', at: record.at, text: away });
    }
    if (compacted !== null) {
        notes.push({ kind: 'compaction', at: record.at, text: compacted });
    }
    return notes;
}

function marksOf(record: ClaudeRecord): Mark[] {
    const compact = claude.compactBoundary(record);
    if (compact !== null) {
        return [compactedMark(record, compact)];
    }
    return claude.compactionFailed(record) ? [{ kind: 'compaction-failed', at: record.at }] : [];
}

export function extractClaude(lines: readonly string[]): Omit<Chunk, 'kind' | 'position' | 'grew'> {
    const meta: Meta = { title: null, lastPrompt: null, claudeRecap: null };
    const entries: Entry[] = [];
    const notes: AgentNote[] = [];
    const marks: Mark[] = [];
    for (const record of claude.readClaudeRecords(lines).records) {
        noteMeta(record, meta);
        entries.push(...entriesOf(record));
        notes.push(...notesOf(record));
        marks.push(...marksOf(record));
    }
    return { entries, notes, marks, ...meta };
}
