import { brand } from '#src/recap/domain/brand.ts';
import { textOf } from '#src/recap/domain/text.ts';
import type { Enumerated, Enumerator } from '#src/ports/enumerators.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import { parseText } from '#src/recap/domain/text.ts';

export type Reply = string | ((document: string, call: number) => string);

export const FAIL = 'fail';

export function scripted(replies: readonly Reply[]): { readonly enumerator: Enumerator; readonly documents: string[] } {
    const documents: string[] = [];
    const enumerator: Enumerator = {
        backend: must(parseText('fake/enumerator')), job: must(parseText('fake · low')),
        write: (document): Promise<Enumerated> => {
            documents.push(document);
            const reply = replies[Math.min(documents.length - 1, replies.length - 1)] ?? '{"candidates":[]}';
            if (reply === FAIL) {
                return Promise.resolve(unknown({ why: 'timeout', after: 1 as never }));
            }
            return Promise.resolve({ kind: 'enumerated', text: textOf(typeof reply === 'string' ? reply : reply(document, documents.length)), costUsd: brand<number, 'Usd'>(0.01) });
        },
    };
    return { enumerator, documents };
}

export const answer = (candidates: readonly Record<string, unknown>[], rest: Record<string, unknown> = {}): string => JSON.stringify({ candidates, ...rest });
