import { must } from '#src/protocol/result.ts';
import { brand } from './brand.ts';
import type { Brand } from './brand.ts';
import { parseText } from './text.ts';
import type { Text } from './text.ts';

export type FailureCause = Brand<string, 'FailureCause'>;

export function parseFailureCause(input: Text): FailureCause {
    return brand<string, 'FailureCause'>(input);
}

export function causeOf(text: Text): FailureCause {
    return parseFailureCause(text);
}

const NAME_SHAPE = /^[A-Za-z][A-Za-z0-9]{0,39}$/;

const CODE_SHAPE = /^[A-Z][A-Z0-9_]{0,39}$/;

const NON_ERROR = 'NonError';

const GENERIC_NAME = 'Error';

export function failureCauseOf(error: unknown): FailureCause {
    let text = NON_ERROR;
    try {
        if (error instanceof Error) {
            const name = NAME_SHAPE.test(error.name) ? error.name : GENERIC_NAME;
            const code = 'code' in error && typeof error.code === 'string' && CODE_SHAPE.test(error.code) ? error.code : null;
            text = code === null ? name : `${name}: ${code}`;
        }
    } catch {
        text = GENERIC_NAME;
    }
    return parseFailureCause(must(parseText(text)));
}
