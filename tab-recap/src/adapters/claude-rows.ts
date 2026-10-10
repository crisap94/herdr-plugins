import type { AgentNote, Chunk, Entry, Mark } from '#src/ports/transcripts.ts';
import { arr, obj, parse, str } from './jsonl.ts';
import type { Row } from './jsonl.ts';
import { claudeNamedCall } from './claude-tool-calls.ts';
import { toolEntry } from './tool-calls.ts';

const NOISE = ['<command-', '<local-command', '<system-reminder', '<task-notification', 'Caveat: The messages below', '[Request interrupted by user'];

const timeOf = (row: Row): number | undefined => {
    const at = Date.parse(str(row['timestamp']) ?? '');
    return Number.isNaN(at) ? undefined : at;
};

function textOf(content: unknown): string {
    if (typeof content === 'string') {
        return content;
    }
    return arr(content).filter((block) => block['type'] === 'text').map((block) => str(block['text']) ?? '').join('\n');
}

interface Meta {
    title: string | null;
    lastPrompt: string | null;
    claudeRecap: string | null;
}

function noteMeta(row: Row, meta: Meta): void {
    if (row['type'] === 'ai-title') {
        meta.title = str(row['aiTitle']) ?? meta.title;
    } else if (row['type'] === 'last-prompt') {
        meta.lastPrompt = str(row['lastPrompt']) ?? meta.lastPrompt;
    } else if (row['type'] === 'system' && row['subtype'] === 'away_summary') {
        meta.claudeRecap = str(row['content']) ?? meta.claudeRecap;
    }
}

function userEntry(row: Row): Entry | null {
    if (row['isSidechain'] === true || row['isMeta'] === true || row['isCompactSummary'] === true) {
        return null;
    }
    const text = textOf(obj(row['message'])['content']);
    const head = text.trimStart();
    const at = timeOf(row);
    return text === '' || NOISE.some((noise) => head.startsWith(noise)) ? null : { role: 'user', text, ...(at === undefined ? {} : { at }) };
}

function queuedEntry(row: Row): Entry | null {
    const attachment = obj(row['attachment']);
    const text = str(attachment['prompt']);
    const at = timeOf(attachment) ?? timeOf(row);
    if (attachment['type'] !== 'queued_command' || obj(attachment['origin'])['kind'] !== 'human' || text === null || row['isSidechain'] === true) {
        return null;
    }
    return NOISE.some((noise) => text.trimStart().startsWith(noise)) ? null : { role: 'user', text, queued: true, ...(at === undefined ? {} : { at }) };
}

function noteOf(row: Row): AgentNote | null {
    const at = timeOf(row) ?? null;
    if (row['type'] === 'system' && row['subtype'] === 'away_summary') {
        const text = str(row['content']);
        return text === null ? null : { kind: 'away_summary', at, text };
    }
    const text = row['isCompactSummary'] === true ? textOf(obj(row['message'])['content']).trim() : '';
    return text === '' ? null : { kind: 'compaction', at, text };
}

const figure = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined);

function compactFigures(metadata: Row): Pick<Mark, 'tokensBefore' | 'tokensAfter' | 'tookMs' | 'trigger'> {
    const [before, after, took] = [figure(metadata['preTokens']), figure(metadata['postTokens']), figure(metadata['durationMs'])];
    const trigger = metadata['trigger'];
    return {
        ...(before === undefined ? {} : { tokensBefore: before }), ...(after === undefined ? {} : { tokensAfter: after }), ...(took === undefined ? {} : { tookMs: took }),
        ...(trigger === 'auto' || trigger === 'manual' ? { trigger } : {}),
    };
}

function markOf(row: Row): Mark | null {
    const at = timeOf(row) ?? null;
    if (row['type'] === 'system' && row['subtype'] === 'compact_boundary') {
        return { kind: 'compacted', at, ...compactFigures(obj(row['compactMetadata'])) };
    }
    const said = typeof row['content'] === 'string' ? row['content'] : textOf(obj(row['message'])['content']);
    return said.includes('Error during compaction') && (row['subtype'] === 'local_command' || said.includes('<local-command-stderr>')) ? { kind: 'compaction-failed', at } : null;
}

function agentEntries(row: Row): readonly Entry[] {
    if (row['isSidechain'] === true) {
        return [];
    }
    const entries: Entry[] = [];
    const at = timeOf(row);
    for (const block of arr(obj(row['message'])['content'])) {
        const text = str(block['text']);
        if (block['type'] === 'text' && text !== null && text.trim() !== '') {
            entries.push({ role: 'agent', text, ...(at === undefined ? {} : { at }) });
        } else if (block['type'] === 'tool_use') {
            entries.push(toolEntry(claudeNamedCall(str(block['name']) ?? 'tool', obj(block['input'])), at));
        }
    }
    return entries;
}

export function extractClaude(lines: readonly string[]): Omit<Chunk, 'kind' | 'position' | 'grew'> {
    const meta: Meta = { title: null, lastPrompt: null, claudeRecap: null };
    const entries: Entry[] = [];
    const notes: AgentNote[] = [];
    const marks: Mark[] = [];
    for (const row of lines.map(parse)) {
        if (row === null) {
            continue;
        }
        noteMeta(row, meta);
        const mark = markOf(row);
        if (mark !== null) {
            marks.push(mark);
        }
        const note = noteOf(row);
        const user = row['type'] === 'user' ? userEntry(row) : queuedEntry(row);
        if (note !== null) {
            notes.push(note);
        }
        if (user !== null) {
            entries.push(user);
        }
        if (row['type'] === 'assistant') {
            entries.push(...agentEntries(row));
        }
    }
    return { entries, notes, marks, ...meta };
}

