// A long coding turn as a reader returns it: one prompt, then 300 rows of reads, edits, test runs, a failure, a commit, a push and replies.
import type { Entry } from '#src/ports/transcripts.ts';

export const START = Date.parse('2026-10-07T09:00:00Z');

const at = (row: number): number => START + row * 20_000;

/** 300 rows after the prompt (the prompt is row 0): 25 steps of twelve rows, with the events a session is made of in the steps named below. */
export function longTurn(): readonly Entry[] {
    const rows: Entry[] = [{ role: 'user', text: 'Move the importer to async streams, fix what breaks and ship it as !41.', at: at(0) }];
    for (let step = 0; step < 25; step += 1) {
        const row = (): number => at(rows.length);
        rows.push({ role: 'agent', text: `Step ${step + 1}: working on the importer's ${['reader', 'parser', 'writer', 'queue', 'retry'][step % 5] ?? 'reader'} in src/import/part${step}.ts.`, at: row() });
        for (let read = 0; read < 4; read += 1) {
            rows.push({ role: 'tool', kind: 'read', text: `src/import/part${(step + read) % 25}.ts`, at: row() });
        }
        rows.push({ role: 'tool', kind: 'edit', text: `src/import/part${step}.ts`, at: row() });
        rows.push({ role: 'tool', kind: 'edit', text: `test/import/part${step}.test.ts`, at: row() });
        rows.push({ role: 'tool', kind: 'shell', text: 'npm test -- --grep importer', what: 'Run the importer tests', at: row() });
        rows.push({ role: 'agent', text: step === 6 ? 'TypeError: stream.pipe is not a function in src/import/part6.ts — the parser still expects a callback.' : `Tests pass for part${step}.`, at: row() });
        rows.push({ role: 'tool', kind: 'shell', text: step === 12 ? 'cd /repo && git commit -m "importer: stream the parser" && git push origin feat/async-import' : 'git status --short', at: row() });
        rows.push({ role: 'tool', kind: 'other', text: `TodoWrite part${step}`, at: row() });
        rows.push({ role: 'agent', text: `Decided to keep the queue bounded at 64 items for part${step}, because the writer cannot keep up otherwise.`, at: row() });
    }
    rows.push({ role: 'tool', kind: 'shell', text: 'glab mr create --title "importer: async streams" --target-branch main', what: 'Open the merge request', at: at(rows.length) });
    rows.push({ role: 'agent', text: 'Opened !41. Should I also remove the legacy callback API in a follow-up?', at: at(rows.length) });
    return rows;
}
