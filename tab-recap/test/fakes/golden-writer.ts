import type { RecapRequest, Summarizer, Written } from '#src/ports/summarizer.ts';

const QUOTES = ['Add a cart to the shop', 'Use SQLite for it, no server', 'also add totals', 'open a merge request', 'can guests keep their basket?', 'cookie is fine'];
const add = (section: string, text: string, anchor: string, why?: string): Record<string, unknown> => ({ op: 'add', section, text, anchor, ...(why === undefined ? {} : { why }) });

const ANSWERS: readonly (readonly Record<string, unknown>[])[] = [
    [add('goal', 'Add a cart to the shop', QUOTES[0] ?? '')],
    [add('decisions', 'Store carts in SQLite', QUOTES[1] ?? '', 'no server needed')],
    [add('done', 'Added cart totals in src/totals.ts', QUOTES[2] ?? '')],
    [add('done', 'Opened !34 for feat/cart', QUOTES[3] ?? '')],
    [add('needs', 'Should guests keep their basket?', QUOTES[4] ?? '')],
    [{ op: 'close', id: 'f5', why: 'answered' }, add('done', 'Guests keep their basket in a cookie', QUOTES[5] ?? '')],
];

export function writer(): { readonly summarizer: Summarizer; readonly seen: RecapRequest[] } {
    const seen: RecapRequest[] = [];
    const summarizer: Summarizer = {
        backend: 'fake',
        contract: 'strict',
        write: (request: RecapRequest): Promise<Written> => {
            seen.push(request);
            const picked = request.input.candidates?.[0];
            const ops = picked === undefined ? ANSWERS[Math.min(seen.length - 1, ANSWERS.length - 1)] ?? [] : [{ op: 'add', anchor: picked.anchor, section: picked.section, text: picked.text }];
            return Promise.resolve({ kind: 'written', text: JSON.stringify({ ops }), costUsd: 0.25 });
        },
    };
    return { summarizer, seen };
}
