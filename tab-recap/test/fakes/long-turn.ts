import type { Entry } from '#src/ports/transcripts.ts';
import { textOf } from '#src/recap/domain/text.ts';
import { instant } from '#src/recap/domain/time.ts';

export const START = Date.parse('2026-10-07T09:00:00Z');

const at = (row: number): number => START + row * 20_000;

export function longTurn(): readonly Entry[] {
    const rows: Entry[] = [{ role: 'user', text: textOf('Move the importer to async streams, fix what breaks and ship it as !41.'), at: instant(at(0)) }];
    for (let step = 0; step < 25; step += 1) {
        const row = (): number => at(rows.length);
        rows.push({ role: 'agent', text: textOf(`Step ${step + 1}: working on the importer's ${['reader', 'parser', 'writer', 'queue', 'retry'][step % 5] ?? 'reader'} in src/import/part${step}.ts.`), at: instant(row()) });
        for (let read = 0; read < 4; read += 1) {
            rows.push({ role: 'tool', kind: 'read', text: textOf(`src/import/part${(step + read) % 25}.ts`), at: instant(row()) });
        }
        rows.push({ role: 'tool', kind: 'edit', text: textOf(`src/import/part${step}.ts`), at: instant(row()) });
        rows.push({ role: 'tool', kind: 'edit', text: textOf(`test/import/part${step}.test.ts`), at: instant(row()) });
        rows.push({ role: 'tool', kind: 'shell', text: textOf('npm test -- --grep importer'), what: textOf('Run the importer tests'), at: instant(row()) });
        rows.push({ role: 'agent', text: textOf(step === 6 ? 'TypeError: stream.pipe is not a function in src/import/part6.ts — the parser still expects a callback.' : `Tests pass for part${step}.`), at: instant(row()) });
        rows.push({ role: 'tool', kind: 'shell', text: textOf(step === 12 ? 'cd /repo && git commit -m "importer: stream the parser" && git push origin feat/async-import' : 'git status --short'), at: instant(row()) });
        rows.push({ role: 'tool', kind: 'other', text: textOf(`TodoWrite part${step}`), at: instant(row()) });
        rows.push({ role: 'agent', text: textOf(`Decided to keep the queue bounded at 64 items for part${step}, because the writer cannot keep up otherwise.`), at: instant(row()) });
    }
    rows.push({ role: 'tool', kind: 'shell', text: textOf('glab mr create --title "importer: async streams" --target-branch main'), what: textOf('Open the merge request'), at: instant(at(rows.length)) });
    rows.push({ role: 'agent', text: textOf('Opened !41. Should I also remove the legacy callback API in a follow-up?'), at: instant(at(rows.length)) });
    return rows;
}
