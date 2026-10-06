// opencode's message and part rows → entries; its compaction answer is a note, not a turn.
import type { DatabaseSync } from 'node:sqlite';
import type { AgentNote, Entry } from '#src/ports/transcripts.ts';
import { obj, parse, str } from './jsonl.ts';
import type { Row } from './jsonl.ts';
import { namedCall, toolEntry } from './tool-calls.ts';

export interface MessageRow { readonly id: string; readonly time_updated: number; readonly data: string }

const millis = (value: unknown): number | undefined => (typeof value === 'number' && value > 0 ? value : undefined);

/** The time of a part (its own start, else when its message was created). */
const partTime = (part: Row, message: Row): number | undefined => millis(obj(part['time'])['start']) ?? millis(obj(message['time'])['created']);

function partEntry(role: string, part: Row, at: number | undefined): Entry | null {
    const text = str(part['text']);
    const when = at === undefined ? {} : { at };
    if (part['type'] === 'text' && text !== null && part['synthetic'] !== true && part['ignored'] !== true && text.trim() !== '') {
        return { role: role === 'user' ? 'user' : 'agent', text, ...when };
    }
    return part['type'] === 'tool' ? toolEntry(namedCall(str(part['tool']) ?? 'tool', obj(obj(part['state'])['input'])), at) : null;
}

/** The answer of opencode's compaction turn: the session's own summary, not part of the conversation. */
const isCompaction = (message: Row): boolean => message['summary'] === true && message['mode'] === 'compaction';

export function partsOf(db: DatabaseSync, message: MessageRow): { readonly entries: readonly Entry[]; readonly notes: readonly AgentNote[] } {
    const data = parse(message.data) ?? {};
    const role = str(data['role']) ?? 'assistant';
    const rows = db.prepare('SELECT data FROM part WHERE message_id = ? ORDER BY time_created ASC').all(message.id) as unknown as readonly { readonly data: string }[];
    const entries = rows.flatMap((part) => {
        const parsed = parse(part.data) ?? {};
        const entry = partEntry(role, parsed, partTime(parsed, data));
        return entry === null ? [] : [entry];
    });
    if (!isCompaction(data)) {
        return { entries, notes: [] };
    }
    const text = entries.filter((entry) => entry.role === 'agent').map((entry) => entry.text).join('\n').trim();
    return { entries: [], notes: text === '' ? [] : [{ kind: 'compaction', at: millis(obj(data['time'])['created']) ?? null, text }] };
}

export const entriesOf = (db: DatabaseSync, message: MessageRow): readonly Entry[] => partsOf(db, message).entries;

