import type { Enumerated, Enumerators } from '#src/ports/enumerators.ts';
import { unknown } from '#src/ports/unknowable.ts';

export type Reply = string | ((document: string, call: number) => string);

export const FAIL = 'fail';

export function scripted(replies: readonly Reply[]): { readonly enumerator: Enumerators; readonly documents: string[] } {
    const documents: string[] = [];
    const enumerator: Enumerators = {
        backend: 'fake/enumerator', job: 'fake · low',
        write: (document): Promise<Enumerated> => {
            documents.push(document);
            const reply = replies[Math.min(documents.length - 1, replies.length - 1)] ?? '{"candidates":[]}';
            if (reply === FAIL) {
                return Promise.resolve(unknown({ why: 'timeout', after: 1 as never }));
            }
            return Promise.resolve({ kind: 'enumerated', text: typeof reply === 'string' ? reply : reply(document, documents.length), costUsd: 0.01 });
        },
    };
    return { enumerator, documents };
}

export const answer = (candidates: readonly Record<string, unknown>[], rest: Record<string, unknown> = {}): string => JSON.stringify({ candidates, ...rest });
