import type { ClaudeCompact, ClaudeRecord } from '@stateforge-labs/harness-adapters/claude';
import * as claude from '@stateforge-labs/harness-adapters/claude';
import type { AgentNote, Chunk, Entry, Mark } from '#src/ports/transcripts.ts';
import { must } from '#src/protocol/result.ts';
import { parseText, type Text, textOf } from '#src/recap/domain/text.ts';
import { namedCallOf, toolEntryOf } from '../tool-calls.ts';
import { instant, duration, type Instant } from '#src/recap/domain/time.ts';
import { countOf } from '#src/recap/domain/count.ts';

const AWAY_SUBTYPE = claude.ClaudeSystemSubtype.enum['away_summary'];

interface Meta {
    title: Text | null;
    lastPrompt: Text | null;
    claudeRecap: Text | null;
}

function awayOf(record: ClaudeRecord): Text | null {
    return record.kind === 'system' && record.subtype === AWAY_SUBTYPE && record.content !== null ? must(parseText(record.content)) : null;
}

function compactRecapOf(record: ClaudeRecord): Text | null {
    if (record.kind !== 'user' || !record['isCompactSummary']) {
        return null;
    }
    const text = record.text.trim();
    return text === '' ? null : must(parseText(text));
}

const atOf = (record: ClaudeRecord): Instant | null => (record.at === null ? null : instant(record.at));

function compactedMark(record: ClaudeRecord, compact: ClaudeCompact): Mark {
    return {
        kind: 'compacted',
        at: atOf(record),
        ...(compact.preTokens === null ? {} : { tokensBefore: countOf(compact.preTokens) }),
        ...(compact.postTokens === null ? {} : { tokensAfter: countOf(compact.postTokens) }),
        ...(compact.durationMs === null ? {} : { tookMs: duration(compact.durationMs) }),
        ...(compact.trigger === null ? {} : { trigger: compact.trigger }),
    };
}

function noteMeta(record: ClaudeRecord, meta: Meta): void {
    if (record.kind === 'ai-title' && record.title !== '') {
        meta.title = must(parseText(record.title));
    }
    if (record.kind === 'last-prompt' && record.prompt !== '') {
        meta.lastPrompt = must(parseText(claude.unwrapPastedContent(record.prompt)));
    }
    meta.claudeRecap = awayOf(record) ?? meta.claudeRecap;
}

function agentEntries(record: ClaudeRecord): Entry[] {
    if (record.kind !== 'assistant' || record.sidechain) {
        return [];
    }
    const entries: Entry[] = [];
    const at = record.at === null ? {} : { at: instant(record.at) };
    for (const block of record.blocks) {
        if (block.kind === 'text' && block.text.trim() !== '') {
            entries.push({ role: 'agent', text: textOf(block.text), ...at });
        } else if (block.kind === 'tool_use') {
            entries.push(toolEntryOf(namedCallOf('claude', textOf(block.name), block.input), atOf(record)));
        }
    }
    return entries;
}

function entriesOf(record: ClaudeRecord): Entry[] {
    const prompt = claude.humanPrompt(record);
    const at = record.at === null ? {} : { at: instant(record.at) };
    const user: Entry[] = prompt === null ? [] : [{ role: 'user', text: textOf(prompt), ...at, ...(record.kind === 'attachment' ? { queued: true } : {}) }];
    return [...user, ...agentEntries(record)];
}

function notesOf(record: ClaudeRecord): AgentNote[] {
    const notes: AgentNote[] = [];
    const away = awayOf(record);
    const compacted = compactRecapOf(record);
    if (away !== null) {
        notes.push({ kind: 'away_summary', at: atOf(record), text: away });
    }
    if (compacted !== null) {
        notes.push({ kind: 'compaction', at: atOf(record), text: compacted });
    }
    return notes;
}

function marksOf(record: ClaudeRecord): Mark[] {
    const compact = claude.compactBoundary(record);
    if (compact !== null) {
        return [compactedMark(record, compact)];
    }
    return claude.compactionFailed(record) ? [{ kind: 'compaction-failed', at: atOf(record) }] : [];
}

export function extractClaudeOf(lines: readonly Text[]): Omit<Chunk, 'kind' | 'position' | 'grew'> {
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
