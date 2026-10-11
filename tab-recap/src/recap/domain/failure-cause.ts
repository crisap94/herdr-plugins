import type { Brand } from './brand.ts';

export type FailureCause = Brand<string, 'FailureCause'>;

const NAME_SHAPE = /^[A-Za-z][A-Za-z0-9]{0,39}$/;

const CODE_SHAPE = /^[A-Z][A-Z0-9_]{0,39}$/;

const NON_ERROR = 'NonError';

const GENERIC_NAME = 'Error';

export function failureCauseOf(error: unknown): FailureCause {
    if (!(error instanceof Error)) {
        return NON_ERROR as FailureCause;
    }
    const name = NAME_SHAPE.test(error.name) ? error.name : GENERIC_NAME;
    const code = 'code' in error && typeof error.code === 'string' && CODE_SHAPE.test(error.code) ? error.code : null;
    return (code === null ? name : `${name}: ${code}`) as FailureCause;
}
