import type { DatabaseSync } from 'node:sqlite';
import type { AgentNote, Entry, Mark } from '#src/ports/transcripts.ts';
import { opencodeObserved } from './opencode-context.ts';
import { obj, parse, str } from './jsonl.ts';
import type { Row } from './jsonl.ts';
import { opencodeNamedCall } from './opencode-tool-calls.ts';
import { toolEntry } from './tool-calls.ts';

export interface MessageRow { readonly id: string; readonly time_updated: number; readonly data: string }

const millis = (value: unknown): number | undefined => (typeof value === 'number' && value > 0 ? value : undefined);

const partTime = (part: Row, message: Row): number | undefined => millis(obj(part['time'])['start']) ?? millis(obj(message['time'])['created']);

function partEntry(role: string, part: Row, at: number | undefined): Entry | null {
    const text = str(part['text']);
    const when = at === undefined ? {} : { at };
    if (part['type'] === 'text' && text !== null && part['synthetic'] !== true && part['ignored'] !== true && text.trim() !== '') {
        return { role: role === 'user' ? 'user' : 'agent', text, ...when };
    }
    return part['type'] === 'tool' ? toolEntry(opencodeNamedCall(str(part['tool']) ?? 'tool', obj(obj(part['state'])['input'])), at) : null;
}

const isCompaction = (message: Row): boolean => message['summary'] === true && message['mode'] === 'compaction';

function markOf(data: Row): Mark {
    const [created, completed] = [millis(obj(data['time'])['created']), millis(obj(data['time'])['completed'])];
    const tokens = opencodeObserved({ ...data, role: 'assistant' })?.tokens;
    return { kind: 'compacted', at: created ?? null, ...(tokens === undefined ? {} : { tokensBefore: tokens }), ...(created === undefined || completed === undefined || completed < created ? {} : { tookMs: completed - created }) };
}

export interface Parts { readonly entries: readonly Entry[]; readonly notes: readonly AgentNote[]; readonly marks: readonly Mark[] }

export function partsOf(db: DatabaseSync, message: MessageRow): Parts {
    const data = parse(message.data) ?? {};
    const role = str(data['role']) ?? 'assistant';
    const rows = db.prepare('SELECT data FROM part WHERE message_id = ? ORDER BY time_created ASC').all(message.id) as unknown as readonly { readonly data: string }[];
    const entries = rows.flatMap((part) => {
        const parsed = parse(part.data) ?? {};
        const entry = partEntry(role, parsed, partTime(parsed, data));
        return entry === null ? [] : [entry];
    });
    if (!isCompaction(data)) {
        return { entries, notes: [], marks: [] };
    }
    const text = entries.filter((entry) => entry.role === 'agent').map((entry) => entry.text).join('\n').trim();
    return { entries: [], notes: text === '' ? [] : [{ kind: 'compaction', at: millis(obj(data['time'])['created']) ?? null, text }], marks: text === '' ? [] : [markOf(data)] };
}

export const entriesOf = (db: DatabaseSync, message: MessageRow): readonly Entry[] => partsOf(db, message).entries;

