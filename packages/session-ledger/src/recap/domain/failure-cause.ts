import { brand } from './brand.ts';
import type { Brand } from './brand.ts';
import { must } from '#src/protocol/result.ts';
import { parseText, type Text } from './text.ts';

export type FailureCause = Brand<string, 'FailureCause'>;

export function parseFailureCause(input: Text): FailureCause {
    return brand<string, 'FailureCause'>(input);
}

export function causeOf(text: Text): FailureCause {
    return parseFailureCause(text);
}

export type Thrown = Brand<Error | null, 'Thrown'>;

export function parseThrown(input: unknown): Thrown {
    return brand<Error | null, 'Thrown'>(input instanceof Error ? input : null);
}

export function failureCauseOf(error: Thrown): FailureCause {
    let text = 'NonError';
    try {
        if (error instanceof Error) {
            const name = /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(error.name) ? error.name : 'Error';
            const code = 'code' in error && typeof error.code === 'string' && /^[A-Z][A-Z0-9_]{0,39}$/.test(error.code) ? error.code : null;
            text = code === null ? name : `${name}: ${code}`;
        }
    } catch { text = 'Error'; }
    return parseFailureCause(must(parseText(text)));
}
