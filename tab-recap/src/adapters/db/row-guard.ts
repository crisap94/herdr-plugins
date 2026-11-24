import { failureCauseOf, parseThrown } from '@stateforge-labs/session-ledger';
import { unreadableOf, type Unknown } from '@stateforge-labs/session-ledger';

export interface Row {
    readonly [column: string]: unknown;
}

export type Column = 'agent' | 'all_hidden' | 'anchor' | 'at' | 'backend' | 'born' | 'claude_note' | 'closed_at' | 'closed_why' | 'cursor' | 'error' | 'fact' | 'first_at' | 'good' | 'has_input' | 'id' | 'key' | 'language' | 'last_at' | 'last_prompt' | 'legacy_markdown' | 'micro' | 'n' | 'name' | 'pane' | 'position' | 'ref' | 'run' | 'run_id' | 'running' | 'section' | 'source' | 'state' | 'tab_id' | 'tail' | 'task' | 'task_id' | 'text' | 'title' | 'why';

export function isRow(input: unknown): input is Row {
    return typeof input === 'object' && input !== null;
}

export class BadRow extends Error {}

export function guarded<T>(read: () => T, fallback: T): T {
    try {
        return read();
    } catch {
        return fallback;
    }
}

export function guardedRead<T>(read: () => T): T | Unknown {
    try {
        return read();
    } catch (error) {
        return unreadableOf(failureCauseOf(parseThrown(error)));
    }
}
