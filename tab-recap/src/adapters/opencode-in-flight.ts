import type { DatabaseSync } from 'node:sqlite';
import type { InFlightResult } from '#src/ports/transcripts.ts';
import { obj, parse } from './jsonl.ts';

export function opencodeInFlight(db: DatabaseSync, session: string, messageLimit: number): InFlightResult {
    const rows = db.prepare('SELECT p.data FROM part AS p JOIN (SELECT id FROM message WHERE session_id = ? ORDER BY time_created DESC LIMIT ?) AS newest ON newest.id = p.message_id').all(session, messageLimit) as unknown as readonly { readonly data: string }[];
    const count = rows.reduce((total, row) => {
        const part = parse(row.data) ?? {};
        const state = obj(part['state']);
        return part['type'] === 'tool' && (state['status'] === 'pending' || state['status'] === 'running') ? total + 1 : total;
    }, 0);
    return { kind: 'in-flight', count };
}
