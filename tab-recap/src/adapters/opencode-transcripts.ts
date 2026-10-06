// opencode keeps its sessions in SQLite. Opened `readOnly` (rules/recap-sqlite-readonly.yml): we never write its database.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { Chunk, ChunkResult, Entry, Located, ObservedResult, Position, PromptResult, Transcripts } from '#src/ports/transcripts.ts';
import { unknown } from '#src/ports/unknowable.ts';
import type { Unknown } from '#src/ports/unknowable.ts';
import { opencodeObserved } from './context-rows.ts';
import { parse, str } from './jsonl.ts';
import { entriesOf, partsOf } from './opencode-parts.ts';
import type { MessageRow } from './opencode-parts.ts';

/** the newest messages read per recap: a long session is never read from its start */
const MESSAGES = 400;
/** how many of the newest messages are looked through for the newest user prompt */
const PROMPT_LOOKBACK = 30;
const SEPARATOR = '#';

export function opencodeDatabase(env: Readonly<Record<string, string | undefined>> = process.env): string {
    const data = env['XDG_DATA_HOME'];
    return join(data !== undefined && data !== '' ? data : join(homedir(), '.local', 'share'), 'opencode', 'opencode.db');
}

/** Within `budget` bytes of text, keeping the most recent. */
function newest(entries: readonly Entry[], budget: number): readonly Entry[] {
    let used = 0;
    let from = entries.length;
    while (from > 0 && used + (entries[from - 1]?.text.length ?? 0) <= budget) {
        used += entries[from - 1]?.text.length ?? 0;
        from -= 1;
    }
    return entries.slice(from);
}

/** opencode sessions: the newest top-level session whose directory is the lane's cwd. The cursor is the newest `time_updated` read. */
export class OpencodeTranscripts implements Transcripts {
    readonly agent = 'opencode';
    private readonly database: string;

    constructor(database = opencodeDatabase()) {
        this.database = database;
    }

    locate(lane: Lane): Promise<Located> {
        if (lane.cwd === null) {
            return Promise.resolve(unknown({ why: 'not-found', what: `a cwd for ${lane.pane}` }));
        }
        if (!existsSync(this.database)) {
            return Promise.resolve(unknown({ why: 'not-found', what: `opencode's database ${this.database}` }));
        }
        try {
            return Promise.resolve(this.withDatabase((db) => this.newestSession(db, lane.cwd ?? '')));
        } catch (error) {
            return Promise.resolve(this.unreadable(error));
        }
    }

    read(source: string, was: Position, budget: number): Promise<ChunkResult> {
        const at = source.lastIndexOf(SEPARATOR);
        try {
            return Promise.resolve(this.withDatabase((db) => this.chunkOf(db, source.slice(at + 1), was, budget)));
        } catch (error) {
            return Promise.resolve(this.unreadable(error));
        }
    }

    latestPrompt(source: string): Promise<PromptResult> {
        const session = source.slice(source.lastIndexOf(SEPARATOR) + 1);
        try {
            return Promise.resolve(this.withDatabase((db) => this.promptOf(db, session)));
        } catch (error) {
            return Promise.resolve(this.unreadable(error));
        }
    }

    observed(source: string): Promise<ObservedResult> {
        const session = source.slice(source.lastIndexOf(SEPARATOR) + 1);
        try {
            return Promise.resolve(this.withDatabase((db) => this.observedIn(db, session)));
        } catch (error) {
            return Promise.resolve(this.unreadable(error));
        }
    }

    /** The newest assistant message that carries tokens. */
    private observedIn(db: DatabaseSync, session: string): ObservedResult {
        const rows = db.prepare('SELECT data FROM message WHERE session_id = ? ORDER BY time_created DESC LIMIT ?').all(session, PROMPT_LOOKBACK) as unknown as readonly { readonly data: string }[];
        for (const row of rows) {
            const found = opencodeObserved(parse(row.data) ?? {});
            if (found !== null) {
                return { kind: 'observed', observed: found };
            }
        }
        return { kind: 'observed', observed: null };
    }

    private promptOf(db: DatabaseSync, session: string): PromptResult {
        const rows = db.prepare('SELECT id, time_updated, data FROM message WHERE session_id = ? ORDER BY time_created DESC LIMIT ?')
            .all(session, PROMPT_LOOKBACK) as unknown as readonly MessageRow[];
        for (const row of rows) {
            const prompt = entriesOf(db, row).findLast((entry) => entry.role === 'user');
            if (prompt !== undefined) {
                return { kind: 'prompt', text: prompt.text };
            }
        }
        return { kind: 'prompt', text: null };
    }

    private unreadable(error: unknown): Unknown {
        return unknown({ why: 'unreadable', detail: error instanceof Error ? error.message : String(error) });
    }

    private withDatabase<T>(use: (db: DatabaseSync) => T): T {
        const db = new DatabaseSync(this.database, { readOnly: true });
        try {
            return use(db);
        } finally {
            db.close();
        }
    }

    private newestSession(db: DatabaseSync, cwd: string): Located {
        const found = db.prepare('SELECT id FROM session WHERE directory = ? AND parent_id IS NULL AND time_archived IS NULL ORDER BY time_updated DESC LIMIT 1').get(cwd) as { readonly id: string } | undefined;
        return found === undefined ? unknown({ why: 'not-found', what: `an opencode session in ${cwd}` }) : { kind: 'located', source: `${this.database}${SEPARATOR}${found.id}` };
    }

    private chunkOf(db: DatabaseSync, session: string, was: Position, budget: number): Chunk {
        const rows = db.prepare('SELECT id, time_updated, data FROM message WHERE session_id = ? AND time_updated > ? ORDER BY time_created DESC LIMIT ?')
            .all(session, was.cursor, MESSAGES) as unknown as readonly MessageRow[];
        const messages = rows.toReversed();
        const read = messages.map((message) => partsOf(db, message));
        const entries = newest(read.flatMap((one) => one.entries), budget);
        const title = db.prepare('SELECT title FROM session WHERE id = ?').get(session) as { readonly title: string } | undefined;
        const prompts = entries.filter((entry) => entry.role === 'user');
        return {
            kind: 'chunk', entries, title: str(title?.title) ?? null, lastPrompt: prompts.at(-1)?.text ?? null, claudeRecap: null, notes: read.flatMap((one) => one.notes),
            position: { cursor: Math.max(was.cursor, ...rows.map((row) => row.time_updated)), tail: null }, grew: rows.length > 0,
        };
    }
}
